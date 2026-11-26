import {createReminderUpdateTest} from './reminder-update-test';
import {reminderPermission,reminderSessionReady,REMINDER_SCOPE} from './phone-reminder';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database,bookingAttemptDatabase} from '../database';
import {searchGuestAddresses} from './guest-search';
import {contextualPlaceQuery,normalPlace,basePlaceLabel} from './place-refinement';
import {setBookingUpdates} from './booking-updates';
import {NOTIFICATION_SCOPE} from './notification-consent';
import {alexaTaxiStatus} from './status';
import {suggestAlexaPickup,parseTaxiJourney,type AlexaLocationContext} from './location';
import {alexaJourneySchema,directAutocabQuote,sealAutocabQuote,openAutocabQuote,recheckAutocabFare} from './autocab-quote';
import {directBookingBody,submitDirectAutocabBooking} from './autocab-booking';
import {hash,fareSpeech} from './policy';

type Address=z.infer<typeof alexaJourneySchema>['pickup'];
type Details={reminderTestUntil?:number;reminderTestKind?:string;bookingId?:string;pickup?:Address;destination?:Address;candidate?:Address;alternatives?:Address[];name?:string;phone?:string;quote?:string;mode?:'live'|'preview';pendingDestination?:string;city?:string;locationTried?:boolean;candidateSource?:'gps'|'device';candidateMeasuredAt?:number};
type Row={id:string;principal:string;phase:string;details:Details;expires_at:Date};
export type GuestInput={principal:string;session:string;requestId:string;type:string;intent?:string;value?:string;journey?:string;location?:AlexaLocationContext};
export type GuestReply={version:string;sessionAttributes:Record<string,never>;response:{outputSpeech:{type:string;text:string};shouldEndSession:boolean;card?:{type:'AskForPermissionsConsent';permissions:string[]};reprompt?:{outputSpeech:{type:string;text:string}}}};
export function guestReply(text:string,end=false):GuestReply{return {version:'1.0',sessionAttributes:{},response:{outputSpeech:{type:'PlainText',text},shouldEndSession:end,...(!end?{reprompt:{outputSpeech:{type:'PlainText',text}}}:{})}};}
const prompts:Record<string,string>={pickup:'What is your pickup address or place? Say, pick me up from, then the place or address.',destination:'Where are you going? Say, take me to, then the place or address.',name:'What is the passenger name? Say my name is, followed by your name.',phone:'What is your contact phone number? Say my phone number is, followed by the number.'};
export function guestPhone(raw:string){const cleaned=raw.replace(/[ ()-]/g,'');return /^(?:(?:\+44|0044)[1-9][0-9]{9}|0[1-9][0-9]{9})$/.test(cleaned)?cleaned.replace(/^0044/,'+44'):null;}
const deps={db:database,attempts:bookingAttemptDatabase,address:searchGuestAddresses,location:suggestAlexaPickup,quote:directAutocabQuote,recheck:recheckAutocabFare,submit:submitDirectAutocabBooking,status:alexaTaxiStatus,updates:setBookingUpdates,reminder:createReminderUpdateTest,mode:undefined as 'live'|'preview'|undefined};
export async function guestConversation(input:GuestInput,services:Partial<typeof deps>={}){
 const s={...deps,...services},bookingMode=s.mode??(process.env.ALEXA_GUEST_BOOKING_MODE==='live'?'live':'preview'),db=s.db(),session=hash(input.session),principal=hash(input.principal),request=hash(input.requestId);
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
  if(input.intent==='TaxiStatusIntent')return finish(guestReply(await s.status(input.principal),true));
  async function updatePreference(enabled:boolean,bookingId?:string){
   const result=await s.updates(input.principal,enabled,bookingId);
   if(!result.saved)return guestReply('I could not save an update preference for a confirmed booking. You can still ask where is my taxi.',true);
   if(!enabled)return guestReply('Okay, I will not send updates for this booking. Your taxi booking is unchanged. You can still ask where is my taxi.',true);
   const reply=guestReply(result.permission?'I will notify you when your driver is on the way, when the pickup estimate is two minutes away, and when your taxi is outside. Ask where is my taxi to hear the details.':'Your update preference is saved. Enable notifications for Need A Cab Plus in the Alexa app to receive alerts. Then ask where is my taxi to hear the details.',true);
   if(!result.permission)reply.response.card={type:'AskForPermissionsConsent',permissions:[NOTIFICATION_SCOPE]};
   return reply;
  }
  if(input.intent==='EnableTaxiUpdatesIntent'||input.intent==='DisableTaxiUpdatesIntent'){if(row?.phase==='updates_offer')row.phase='confirmed';return finish(await updatePreference(input.intent==='EnableTaxiUpdatesIntent'));}
  if(row?.phase==='updates_offer'){
   if(['AMAZON.YesIntent','AMAZON.NoIntent','AMAZON.StopIntent','AMAZON.CancelIntent'].includes(input.intent||'')){
    const enabled=input.intent==='AMAZON.YesIntent';row.phase='confirmed';
    const reply=await updatePreference(enabled,row.details.bookingId);return finish(reply);
   }
   return finish(guestReply('Your taxi is already booked. Would you like notifications for this booking? Say yes or no.'));
  }
  const intent=input.intent==='QuickPlaceIntent'?'ProvideAddressIntent':input.intent,cancel=['AMAZON.StopIntent','AMAZON.CancelIntent','AMAZON.NoIntent'].includes(intent||'');
  if(input.type==='SessionEndedRequest')return finish(guestReply('Goodbye.',true));
  if(row&&['confirming','unknown','confirmed'].includes(row.phase))return finish(guestReply(row.phase==='confirmed'?'Your taxi is already booked. Please contact the operator for changes.':'Your booking may be processing. Please contact the operator before making another request.',true));
  if(!row||new Date(row.expires_at).getTime()<=Date.now()||['ended','preview'].includes(row.phase)){
   if(cancel)return finish(guestReply('I stopped this request.',true));
   const unresolved=(await client.query("SELECT id FROM alexa_guest_sessions WHERE principal=$1 AND phase IN ('confirming','unknown') LIMIT 1",[principal])).rows;
   if(unresolved.length)return finish(guestReply('An earlier booking may still be processing. Please contact the operator before booking again.',true));
   row={id:row?.id||randomUUID(),principal,phase:'pickup',details:{},expires_at:new Date(Date.now()+20*60*1000)};
   await client.query("INSERT INTO alexa_guest_sessions(id,principal,session_hash,phase,details,expires_at) VALUES($1,$2,$3,$4,'{}',$5) ON CONFLICT(principal,session_hash) DO UPDATE SET phase='pickup',details='{}',expires_at=EXCLUDED.expires_at",[row.id,principal,session,row.phase,row.expires_at]);
  }
  const current=row;
  function reminderPermissionReply(){const reply=guestReply('To create a five-minute reminder update test, enable Reminders for Need A Cab Plus in the Alexa app, then say send a test reminder again.',true);reply.response.card={type:'AskForPermissionsConsent',permissions:[REMINDER_SCOPE]};return reply;}
  if(intent==='TestPhoneReminderIntent'){
   if(process.env.ALEXA_NOTIFICATIONS_MODE!=='development')return finish(guestReply('The reminder test is unavailable.',true));
   if(!['pickup','reminder_test_confirm'].includes(current.phase))return finish(guestReply('Please finish this taxi conversation first, then open the skill and say send a test reminder.',true));
   if(!reminderPermission(input.location))return finish(reminderPermissionReply());
   if(!reminderSessionReady(input.location))return finish(guestReply('I could not access reminders in this Alexa session. Please open the skill again.',true));
   current.phase='reminder_test_confirm';current.details.reminderTestUntil=Date.now()+5*60000;current.details.reminderTestKind='outside-session-v1';
   return finish(guestReply('Would you like a test reminder in five minutes? After this conversation ends, I will try to change its text to, this reminder was updated after the conversation ended, keeping the same time. Phone notification will be enabled. Say yes or no.'));
  }
  if(current.phase==='reminder_test_confirm'){
   if(['AMAZON.YesIntent','AMAZON.NoIntent','AMAZON.StopIntent','AMAZON.CancelIntent'].includes(intent||'')){
    const valid=current.details.reminderTestKind==='outside-session-v1'&&!!current.details.reminderTestUntil&&current.details.reminderTestUntil>Date.now();current.phase='pickup';delete current.details.reminderTestUntil;delete current.details.reminderTestKind;
    if(intent!=='AMAZON.YesIntent')return finish(guestReply('Okay, I did not create a reminder.',true));
    if(!valid)return finish(guestReply('The test request expired. Say send a test reminder to start again.',true));
    if(!reminderPermission(input.location))return finish(reminderPermissionReply());
    const result=await s.reminder(input.principal,input.location);
    if(result.duplicate)return finish(guestReply('A reminder test was already attempted this hour. Check Reminders in the Alexa app before trying again.',true));
    if(result.state==='created')return finish(guestReply('Your test reminder is set for five minutes from now. I will try to update its text after we finish, keeping that time. Phone notification is enabled. You may close this conversation now.',true));
    if(result.state==='permission_required')return finish(reminderPermissionReply());
    return finish(guestReply(result.state==='rejected'?'Alexa did not create the test reminder. Please check Reminders permission in the Alexa app.':'I could not confirm whether the reminder was created. Check Reminders in the Alexa app before trying again.',true));
   }
   current.phase='pickup';delete current.details.reminderTestUntil;delete current.details.reminderTestKind;
  }
  const addressSearch=(value:string)=>s.address(value,{city:current.details.city});
  function offer(kind:'pickup'|'destination',candidates:Address[],source?:'gps'|'device'){
   const [candidate,...alternatives]=candidates;
   current.phase=kind;delete current.details.candidate;delete current.details.alternatives;delete current.details.candidateSource;delete current.details.candidateMeasuredAt;
   if(!candidate)return guestReply('I could not find that place. Try the street, town or postcode.');
   current.details.candidate=candidate;current.details.alternatives=alternatives;current.details.candidateSource=source;current.phase=kind+'_check';
   const text=source==='gps'?`Based on your location, your pickup is near ${candidate.text}. Is this the right pickup?`:source==='device'?`Shall I pick you up from your device address, ${candidate.text}?`:`I found ${candidate.text}. Is that correct?`;
   return guestReply(text);
  }
  async function locationPickup(force=false){
   if(current.details.locationTried&&!force)return null;
   current.details.locationTried=true;
   const found=await s.location(input.location);if(!found?.address)return null;
   if(found.city)current.details.city=found.city;const reply=offer('pickup',[found.address],found.source);if(found.source==='gps')current.details.candidateMeasuredAt=found.measuredAt??Date.now();return reply;
  }
  async function quoteReply(){
   const quote=await s.quote(alexaJourneySchema.parse({pickup:current.details.pickup,destination:current.details.destination}));
   current.details.quote=sealAutocabQuote(quote);current.phase='quoted';
   const mode=bookingMode;current.details.mode=mode;
   return guestReply(`The passenger is ${current.details.name}. Contact number ${current.details.phone!.split('').join(' ')}. `+fareSpeech(quote.pickup,quote.destination,quote.totalPence,mode));
  }
  async function nextQuestion(){
   if(!current.details.destination){
    current.phase='destination';
    const spoken=current.details.pendingDestination;delete current.details.pendingDestination;
    return spoken?offer('destination',await addressSearch(spoken)):guestReply(prompts.destination);
   }
   current.phase=!current.details.name?'name':'phone';
   return current.details.name&&current.details.phone?quoteReply():guestReply(prompts[current.phase]);
  }
  if(['RefineAddressIntent','ExcludeAddressIntent','CorrectPickupIntent','CorrectDestinationIntent'].includes(intent||'')){
   const value=input.value?.trim()||'';delete current.details.quote;
   let kind:'pickup'|'destination'|undefined=intent==='CorrectPickupIntent'?'pickup':intent==='CorrectDestinationIntent'?'destination':current.phase.startsWith('pickup')?'pickup':current.phase.startsWith('destination')?'destination':undefined;
   if(!kind){const q=normalPlace(value),matches=(['pickup','destination'] as const).filter(k=>{const label=normalPlace(current.details[k]?.text||'');return label&&q.split(' ').filter(w=>w.length>3&&!['want','main','reception','entrance','instead'].includes(w)).some(w=>label.includes(w));});if(matches.length===1)kind=matches[0];}
   if(!kind){current.phase='correction';return finish(guestReply('Should I change the pickup or destination? Say change pickup to, or change destination to, followed by the place.'));}
   const label=current.phase===kind+'_check'?current.details.candidate?.text:current.details[kind]?.text;
   const query=intent==='ExcludeAddressIntent'&&label?basePlaceLabel(label):contextualPlaceQuery(value,label);current.phase=kind;delete current.details.candidate;delete current.details.alternatives;
   return finish(offer(kind,await s.address(query,{city:current.details.city,excluded:intent==='ExcludeAddressIntent'?[value]:[]})));
  }
  if(intent==='AMAZON.StopIntent'||intent==='AMAZON.CancelIntent'){row.phase='ended';row.details={};return finish(guestReply('I stopped this taxi request.',true));}
  if(intent==='AMAZON.NoIntent'){
   if(row.phase==='pickup_check'||row.phase==='destination_check'){const next=row.details.alternatives?.shift();if(next){row.details.candidate=next;return finish(guestReply(`How about ${next.text}? Is that correct?`));}row.phase=row.phase.replace('_check','');delete row.details.candidate;delete row.details.alternatives;delete row.details.candidateSource;delete row.details.candidateMeasuredAt;return finish(guestReply('Tell me a more specific place or address. '+prompts[row.phase]));}
   row.phase='ended';row.details={};return finish(guestReply('I stopped this taxi request.',true));
  }
  if(input.type==='LaunchRequest'||intent==='BookTaxiIntent'){
   if(input.journey){
    const journey=parseTaxiJourney(input.journey);
    if(!journey){current.phase='pickup';delete current.details.quote;delete current.details.pickup;delete current.details.destination;delete current.details.candidate;delete current.details.pendingDestination;return finish(guestReply('Please say, book a taxi from your pickup place to your destination.'));}
    delete current.details.quote;
    if(journey.destination){current.details.pendingDestination=journey.destination;delete current.details.destination;}
    if(/^from\s+(?:here|my (?:current )?location)(?:\s+to\s|$)/i.test(input.journey)){delete current.details.pickup;current.phase='pickup';return finish(await locationPickup(true)||guestReply('Sure. '+prompts.pickup));}
    if(journey.pickup){
     if(!current.details.city&&input.location){const hint=await s.location(input.location,{budgetMs:1500,cityOnly:true});if(hint?.city)current.details.city=hint.city;}
     delete current.details.pickup;return finish(offer('pickup',await addressSearch(journey.pickup)));
    }
    if(current.details.pickup)return finish(await nextQuestion());
   }
   if(current.phase==='pickup')return finish(await locationPickup()||guestReply('Sure. '+prompts.pickup));
   return finish(guestReply(prompts[current.phase]||(current.phase.endsWith('_check')?`Is ${current.details.candidate?.text} correct?`:'Say yes or no to the current question.')));
  }
  const value=input.value?.trim()||'';
  if(intent==='ProvideDestinationIntent'&&value){
   delete current.details.quote;delete current.details.destination;current.details.pendingDestination=value;
   if(current.details.pickup)return finish(await nextQuestion());
   if(current.phase==='pickup_check')return finish(guestReply(`Destination noted. Is ${current.details.candidate?.text} your pickup?`));
   current.phase='pickup';return finish(await locationPickup()||guestReply('Sure. '+prompts.pickup));
  }
  if(intent==='UseLocationIntent'){
   delete current.details.pickup;delete current.details.quote;delete current.details.candidate;delete current.details.alternatives;current.phase='pickup';
   return finish(await locationPickup(true)||guestReply('I could not get a current pickup. '+prompts.pickup));
  }
  const addressPhase=row.phase.replace('_check','');
  if(((intent==='ProvidePickupIntent'||intent==='ProvideAddressIntent')&&addressPhase==='pickup')||((intent==='ProvideDestinationIntent'||intent==='ProvideAddressIntent')&&addressPhase==='destination')){
   return finish(offer(addressPhase as 'pickup'|'destination',await addressSearch(value)));
  }
  if(intent==='AMAZON.YesIntent'&&(row.phase==='pickup_check'||row.phase==='destination_check')){
   const pickup=row.phase==='pickup_check';
   if(pickup&&row.details.candidateSource==='gps'&&(!row.details.candidateMeasuredAt||Date.now()-row.details.candidateMeasuredAt>60000)){current.phase='pickup';delete current.details.candidate;return finish(await locationPickup(true)||guestReply('Your location needs updating. '+prompts.pickup));}
   if(!row.details.candidate)throw Error('MISSING_CANDIDATE');
   if(/\bfree[ -]?phone\b/i.test(row.details.candidate.text)){const kind=pickup?'pickup':'destination';const query=contextualPlaceQuery('not freephone',row.details.candidate.text);delete current.details.quote;return finish(offer(kind,await addressSearch(query)));}
   row.details[pickup?'pickup':'destination']=row.details.candidate;delete row.details.candidate;delete row.details.alternatives;delete row.details.candidateSource;delete row.details.candidateMeasuredAt;
   if(pickup&&typeof row.details.pickup?.town==='string')row.details.city=row.details.pickup.town;
   return finish(await nextQuestion());
  }
  if(intent==='ProvideNameIntent'&&row.phase==='name'){
   if(!/^[\p{L}][\p{L} .'-]{1,99}$/u.test(value))return finish(guestReply(prompts.name));
   row.details.name=value;row.phase='phone';return finish(row.details.phone?await quoteReply():guestReply(prompts.phone));
  }
  if(intent==='ProvidePhoneIntent'&&row.phase==='phone'){
   const phone=guestPhone(value);if(!phone)return finish(guestReply('Please give a UK contact number. '+prompts.phone));
   row.details.phone=phone;
   return finish(await quoteReply());
  }
  if(intent==='AMAZON.YesIntent'&&row.phase==='quoted'){
   if(!row.details.quote)throw Error('MISSING_QUOTE');
   let quote;try{quote=openAutocabQuote(row.details.quote);}catch{row.phase='ended';row.details={};return finish(guestReply('The quote expired or changed. Please start a new taxi request.',true));}
   if(/\bfree[ -]?phone\b/i.test(quote.pickup+' '+quote.destination)){const kind=/\bfree[ -]?phone\b/i.test(quote.pickup)?'pickup':'destination';delete current.details.quote;return finish(offer(kind,await addressSearch(basePlaceLabel(kind==='pickup'?quote.pickup:quote.destination))));}
   if(row.details.mode!==bookingMode){row.phase='ended';row.details={};return finish(guestReply('Booking settings changed. Please ask for a new quote.',true));}
   if(row.details.mode!=='live'){row.phase='preview';row.details={};return finish(guestReply('Test complete. No taxi has been booked.',true));}
   let refreshed;try{refreshed=await s.recheck(quote);}catch(error){if(error instanceof Error&&['AUTOCAB_FARE_CHANGED','ALEXA_AUTOCAB_QUOTE_CHANGED'].includes(error.message)){row.phase='ended';row.details={};return finish(guestReply('The fare changed. Please start a new taxi request so I can read you the new price.',true));}throw error;}
   const body=directBookingBody(quote,refreshed,{name:row.details.name!,telephoneNumber:row.details.phone!});
   row.phase='confirming';await client.query("UPDATE alexa_guest_sessions SET phase='confirming' WHERE id=$1",[row.id]);await client.query('COMMIT');transaction=false;
   // Durable claim above survives transport timeouts or process restarts. Never retry a send here.
   let reply:GuestReply;let confirmedId:string|undefined;
   try{const result=await s.submit(s.attempts(),quote,'alexa-guest:'+principal,body);const ref=result.externalBookingId;
    confirmedId=!result.pending&&!result.rejected&&typeof ref==='string'&&/^\d{1,20}$/.test(ref)?ref:undefined;
    row.phase=result.pending?'unknown':result.rejected?'ended':confirmedId?'updates_offer':'unknown';
    reply=result.pending?guestReply('The booking is awaiting confirmation. Please contact the operator before booking again.',true):result.rejected?guestReply('The operator did not accept this booking. No taxi was confirmed.',true):confirmedId?guestReply(`Your taxi is booked. Your booking reference number is ${confirmedId.split('').join(' ')}. Pay cash to the driver. Would you like me to notify you when your driver is on the way, about two minutes away, and outside?`):guestReply('I could not confirm the booking reference. Please contact the operator before requesting another taxi.',true);}

   catch{row.phase='unknown';reply=guestReply('I could not confirm the booking outcome. Please contact the operator before requesting another taxi.',true);}
   await db.query('UPDATE alexa_guest_sessions SET phase=$2,details=$3::jsonb WHERE id=$1',[row.id,row.phase,JSON.stringify(confirmedId?{bookingId:confirmedId}:{})]);
   await db.query('INSERT INTO alexa_guest_requests(principal,request_hash,response) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[principal,request,JSON.stringify(reply)]);return reply;
  }
  const prompt=prompts[row.phase]||(row.phase.endsWith('_check')?'Is that address correct? Say yes or no.':'Say yes to confirm the quoted fare and passenger details, or no to cancel.');
  return finish(guestReply(prompt));
 }catch{if(transaction)await client.query('ROLLBACK');return guestReply('I could not complete this request. If you already confirmed a fare, contact the operator before booking again. Otherwise, please try again.',true);}
 finally{client.release();}
}
