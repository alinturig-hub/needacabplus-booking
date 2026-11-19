import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database,bookingAttemptDatabase} from '../database';
import {searchGuestAddresses} from './guest-search';
import {alexaJourneySchema,directAutocabQuote,sealAutocabQuote,openAutocabQuote,recheckAutocabFare} from './autocab-quote';
import {directBookingBody,submitDirectAutocabBooking} from './autocab-booking';
import {hash,fareSpeech} from './policy';

type Address=z.infer<typeof alexaJourneySchema>['pickup'];
type Details={pickup?:Address;destination?:Address;candidate?:Address;alternatives?:Address[];name?:string;phone?:string;quote?:string;mode?:'live'|'preview'};
type Row={id:string;principal:string;phase:string;details:Details;expires_at:Date};
export type GuestInput={principal:string;session:string;requestId:string;type:string;intent?:string;value?:string};
export type GuestReply={version:string;sessionAttributes:Record<string,never>;response:{outputSpeech:{type:string;text:string};shouldEndSession:boolean;reprompt?:{outputSpeech:{type:string;text:string}}}};
export function guestReply(text:string,end=false):GuestReply{return {version:'1.0',sessionAttributes:{},response:{outputSpeech:{type:'PlainText',text},shouldEndSession:end,...(!end?{reprompt:{outputSpeech:{type:'PlainText',text}}}:{})}};}
const prompts:Record<string,string>={pickup:'What is your pickup address or place? Say, pick me up from, then the place or address.',destination:'Where are you going? Say, take me to, then the place or address.',name:'What is the passenger name? Say my name is, followed by your name.',phone:'What is your contact phone number? Say my phone number is, followed by the number.'};
export function guestPhone(raw:string){const cleaned=raw.replace(/[ ()-]/g,'');return /^(?:(?:\+44|0044)[1-9][0-9]{9}|0[1-9][0-9]{9})$/.test(cleaned)?cleaned.replace(/^0044/,'+44'):null;}
const deps={db:database,attempts:bookingAttemptDatabase,address:searchGuestAddresses,quote:directAutocabQuote,recheck:recheckAutocabFare,submit:submitDirectAutocabBooking};
export async function guestConversation(input:GuestInput,services:Partial<typeof deps>={}){
 const s={...deps,...services},db=s.db(),session=hash(input.session),principal=hash(input.principal),request=hash(input.requestId);
 const client=await db.connect();let transaction=false;
 try{
  await client.query('BEGIN');transaction=true;
  await client.query("SET LOCAL lock_timeout='1500ms'");
  await client.query("DELETE FROM alexa_guest_requests WHERE created_at<now()-interval '24 hours'");
  await client.query("DELETE FROM alexa_guest_sessions WHERE expires_at<now()-interval '24 hours' AND phase NOT IN ('confirming','unknown')");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['alexa-guest:'+principal]);
  const prior=(await client.query<{response:GuestReply}>('SELECT response FROM alexa_guest_requests WHERE principal=$1 AND request_hash=$2',[principal,request])).rows[0];
  if(prior){await client.query('COMMIT');transaction=false;return prior.response;}
  let row=(await client.query<Row>('SELECT * FROM alexa_guest_sessions WHERE principal=$1 AND session_hash=$2 FOR UPDATE',[principal,session])).rows[0];
  const rate=(await client.query<{count:number}>("SELECT count(*)::int AS count FROM alexa_guest_requests WHERE principal=$1 AND created_at>now()-interval '1 minute'",[principal])).rows[0];
  if(Number(rate.count)>=15){await client.query('ROLLBACK');transaction=false;return guestReply('Please wait a minute before trying again.',true);}
  async function finish(reply:GuestReply){
   if(row)await client.query('UPDATE alexa_guest_sessions SET phase=$2,details=$3::jsonb WHERE id=$1',[row.id,row.phase,JSON.stringify(row.details)]);
   await client.query('INSERT INTO alexa_guest_requests(principal,request_hash,response) VALUES($1,$2,$3::jsonb)',[principal,request,JSON.stringify(reply)]);
   await client.query('COMMIT');transaction=false;return reply;
  }
  const intent=input.intent,cancel=['AMAZON.StopIntent','AMAZON.CancelIntent','AMAZON.NoIntent'].includes(intent||'');
  if(input.type==='SessionEndedRequest')return finish(guestReply('Goodbye.',true));
  if(row&&['confirming','unknown','confirmed'].includes(row.phase))return finish(guestReply(row.phase==='confirmed'?'Your taxi is already booked. Please contact the operator for changes.':'Your booking may be processing. Please contact the operator before making another request.',true));
  if(!row||new Date(row.expires_at).getTime()<=Date.now()||['ended','preview'].includes(row.phase)){
   if(cancel)return finish(guestReply('I stopped this request.',true));
   const unresolved=(await client.query("SELECT id FROM alexa_guest_sessions WHERE principal=$1 AND phase IN ('confirming','unknown') LIMIT 1",[principal])).rows;
   if(unresolved.length)return finish(guestReply('An earlier booking may still be processing. Please contact the operator before booking again.',true));
   row={id:row?.id||randomUUID(),principal,phase:'pickup',details:{},expires_at:new Date(Date.now()+20*60*1000)};
   await client.query("INSERT INTO alexa_guest_sessions(id,principal,session_hash,phase,details,expires_at) VALUES($1,$2,$3,$4,'{}',$5) ON CONFLICT(principal,session_hash) DO UPDATE SET phase='pickup',details='{}',expires_at=EXCLUDED.expires_at",[row.id,principal,session,row.phase,row.expires_at]);
  }
  if(intent==='AMAZON.StopIntent'||intent==='AMAZON.CancelIntent'){row.phase='ended';row.details={};return finish(guestReply('I stopped this taxi request.',true));}
  if(intent==='AMAZON.NoIntent'){
   if(row.phase==='pickup_check'||row.phase==='destination_check'){const next=row.details.alternatives?.shift();if(next){row.details.candidate=next;return finish(guestReply(`How about ${next.text}? Is that correct?`));}row.phase=row.phase.replace('_check','');delete row.details.candidate;delete row.details.alternatives;return finish(guestReply('Tell me a more specific place or address. '+prompts[row.phase]));}
   row.phase='ended';row.details={};return finish(guestReply('I stopped this taxi request.',true));
  }
  if(input.type==='LaunchRequest'||intent==='BookTaxiIntent')return finish(guestReply((input.type==='LaunchRequest'?'Welcome. ':'')+(prompts[row.phase]||'Say yes or no to the current question.')));
  const value=input.value?.trim()||'';
  const addressPhase=row.phase.replace('_check','');
  if(((intent==='ProvidePickupIntent'||intent==='ProvideAddressIntent')&&addressPhase==='pickup')||((intent==='ProvideDestinationIntent'||intent==='ProvideAddressIntent')&&addressPhase==='destination')){
   row.phase=addressPhase;delete row.details.candidate;delete row.details.alternatives;
   const candidates=await s.address(value);
   if(!candidates.length)return finish(guestReply('I could not find that place. Try the street, town or postcode.'));
   const [candidate,...alternatives]=candidates;row.details.candidate=candidate;row.details.alternatives=alternatives;row.phase=addressPhase+'_check';return finish(guestReply(`I found ${candidate.text}. Is that correct?`));
  }
  if(intent==='AMAZON.YesIntent'&&(row.phase==='pickup_check'||row.phase==='destination_check')){
   const pickup=row.phase==='pickup_check';if(!row.details.candidate)throw Error('MISSING_CANDIDATE');
   row.details[pickup?'pickup':'destination']=row.details.candidate;delete row.details.candidate;delete row.details.alternatives;
   row.phase=pickup?'destination':'name';return finish(guestReply(prompts[row.phase]));
  }
  if(intent==='ProvideNameIntent'&&row.phase==='name'){
   if(!/^[\p{L}][\p{L} .'-]{1,99}$/u.test(value))return finish(guestReply(prompts.name));
   row.details.name=value;row.phase='phone';return finish(guestReply(prompts.phone));
  }
  if(intent==='ProvidePhoneIntent'&&row.phase==='phone'){
   const phone=guestPhone(value);if(!phone)return finish(guestReply('Please give a UK contact number. '+prompts.phone));
   row.details.phone=phone;
   const quote=await s.quote(alexaJourneySchema.parse({pickup:row.details.pickup,destination:row.details.destination}));
   row.details.quote=sealAutocabQuote(quote);row.phase='quoted';
   // Guest preview is independent of the linked-account setting and defaults off for dispatch.
   const mode=process.env.ALEXA_GUEST_BOOKING_MODE==='live'?'live':'preview';row.details.mode=mode;
   const identity=`The passenger is ${row.details.name}. Contact number ${phone.split('').join(' ')}. `;
   return finish(guestReply(identity+fareSpeech(quote.pickup,quote.destination,quote.totalPence,mode)));
  }
  if(intent==='AMAZON.YesIntent'&&row.phase==='quoted'){
   if(!row.details.quote)throw Error('MISSING_QUOTE');
   let quote;try{quote=openAutocabQuote(row.details.quote);}catch{row.phase='ended';row.details={};return finish(guestReply('The quote expired or changed. Please start a new taxi request.',true));}
   if(row.details.mode!==(process.env.ALEXA_GUEST_BOOKING_MODE==='live'?'live':'preview')){row.phase='ended';row.details={};return finish(guestReply('Booking settings changed. Please ask for a new quote.',true));}
   if(row.details.mode!=='live'){row.phase='preview';row.details={};return finish(guestReply('Test complete. No taxi has been booked.',true));}
   let refreshed;try{refreshed=await s.recheck(quote);}catch(error){if(error instanceof Error&&['AUTOCAB_FARE_CHANGED','ALEXA_AUTOCAB_QUOTE_CHANGED'].includes(error.message)){row.phase='ended';row.details={};return finish(guestReply('The fare changed. Please start a new taxi request so I can read you the new price.',true));}throw error;}
   const body=directBookingBody(quote,refreshed,{name:row.details.name!,telephoneNumber:row.details.phone!});
   row.phase='confirming';await client.query("UPDATE alexa_guest_sessions SET phase='confirming' WHERE id=$1",[row.id]);await client.query('COMMIT');transaction=false;
   // Durable claim above survives transport timeouts or process restarts. Never retry a send here.
   let reply:GuestReply;
   try{const result=await s.submit(s.attempts(),quote,'alexa-guest:'+principal,body);row.phase=result.pending?'unknown':result.rejected?'ended':'confirmed';reply=guestReply(result.pending?'The booking is awaiting confirmation. Please contact the operator before booking again.':result.rejected?'The operator did not accept this booking. No taxi was confirmed.':'Your taxi is booked. Pay cash to the driver.',true);}
   catch{row.phase='unknown';reply=guestReply('I could not confirm the booking outcome. Please contact the operator before requesting another taxi.',true);}
   await db.query('UPDATE alexa_guest_sessions SET phase=$2,details=$3::jsonb WHERE id=$1',[row.id,row.phase,JSON.stringify({})]);
   await db.query('INSERT INTO alexa_guest_requests(principal,request_hash,response) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[principal,request,JSON.stringify(reply)]);return reply;
  }
  const prompt=prompts[row.phase]||(row.phase.endsWith('_check')?'Is that address correct? Say yes or no.':'Say yes to confirm the quoted fare and passenger details, or no to cancel.');
  return finish(guestReply(prompt));
 }catch{if(transaction)await client.query('ROLLBACK');return guestReply('I could not complete this request. If you already confirmed a fare, contact the operator before booking again. Otherwise, please try again.',true);}
 finally{client.release();}
}
