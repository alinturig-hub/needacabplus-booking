import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database,bookingAttemptDatabase} from '../database';
import {alexaJourneySchema,directAutocabQuote,sealAutocabQuote,openAutocabQuote,recheckAutocabFare} from './autocab-quote';
import {directBookingBody,submitDirectAutocabBooking} from './autocab-booking';
import {readLiveAttempt} from '../live-cash-booking';
import {alexaConfig,hash,savedPlace,fareSpeech,type SavedPlace} from './policy';
import type {AlexaCustomer} from './oauth';
export const conversationInput=z.object({action:z.enum(['quote','confirm','cancel']),requestId:z.string().min(10).max(256),sessionId:z.string().min(10).max(256),pickup:z.string().trim().min(1).max(60).optional(),destination:z.string().trim().min(1).max(60).optional(),conversationId:z.string().uuid().optional()}).strict();
type Input=z.infer<typeof conversationInput>;
type Row={id:string;state:string;quote_id:string|null;quote_token:string|null;speech:string|null;result:Record<string,unknown>|null;mode:'live'|'preview';expires_at:Date};
const reply=(speech:string,phase='ended',conversationId?:string)=>({speech,phase,...(conversationId?{conversationId}:{})});
export async function alexaConversation(customer:AlexaCustomer,input:Input){
 const config=alexaConfig(),db=database(),session=hash(input.sessionId);
 if(input.action==='quote'){
  if(!input.destination)return reply('Where would you like to go? Say a saved place, such as Work.','ask_destination');
  const prior=(await db.query<Row>('SELECT * FROM alexa_conversations WHERE grant_id=$1 AND request_id=$2 AND session_hash=$3',[customer.grantId,input.requestId,session])).rows[0];
  if(prior)return prior.state==='quoted'&&prior.quote_token?.startsWith('aa1.')&&new Date(prior.expires_at).getTime()>Date.now()?reply(prior.speech!,'quoted',prior.id):reply('That request has ended. Please ask for a new quote.');
  const places=(await db.query<SavedPlace>('SELECT id,kind,name,address,full_address FROM customer_places WHERE customer_id=$1',[customer.id])).rows;
  let pickup:SavedPlace,destination:SavedPlace;
  try{pickup=savedPlace(places,input.pickup||'Home');destination=savedPlace(places,input.destination);}catch{return reply('I could not identify one saved address. Please save or rename Home, Work, or your favourite in the Need A Cab Plus app, then try again.');}
  const id=randomUUID(),client=await db.connect();
  try{
   await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",['alexa:'+customer.id]);
   const rate=(await client.query("SELECT count(*)::int AS count FROM alexa_conversations v JOIN alexa_grants g ON g.id=v.grant_id WHERE g.customer_id=$1 AND v.created_at>now()-interval '1 minute'",[customer.id])).rows[0];
   if(Number(rate.count)>=5)throw Error('RATE_LIMIT');
   // A different quote invalidates every pending quote in this voice session.
   await client.query("UPDATE alexa_conversations SET state='cancelled' WHERE grant_id=$1 AND session_hash=$2 AND state IN ('quoting','quoted')",[customer.grantId,session]);
   await client.query("INSERT INTO alexa_conversations(id,grant_id,session_hash,request_id,mode,state,expires_at) VALUES($1,$2,$3,$4,$5,'quoting',now()+interval '3 minutes')",[id,customer.grantId,session,input.requestId,config.mode]);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  try{
   const quote=await directAutocabQuote(alexaJourneySchema.parse({pickup:{...pickup.full_address,text:pickup.address},destination:{...destination.full_address,text:destination.address}}));
   const speech=fareSpeech(quote.pickup,quote.destination,quote.totalPence,config.mode);
   const saved=await db.query("UPDATE alexa_conversations SET quote_token=$2,speech=$3,state='quoted',expires_at=LEAST(expires_at,$4::timestamptz),quote_id=$5 WHERE id=$1 AND state='quoting' RETURNING id",[id,sealAutocabQuote(quote),speech,quote.expiresAt,quote.id]);
   return saved.rows.length?reply(speech,'quoted',id):reply('The journey changed. Please ask for a new quote.');
  }catch(error){await db.query("UPDATE alexa_conversations SET state='cancelled' WHERE id=$1 AND state='quoting'",[id]);throw error;}
 }
 if(!input.conversationId)return reply('Please ask for a taxi quote first.');
 const row=(await db.query<Row>('SELECT * FROM alexa_conversations WHERE id=$1 AND grant_id=$2 AND session_hash=$3',[input.conversationId,customer.grantId,session])).rows[0];
 if(!row)return reply('Please ask for a new quote in this conversation.');
 if(row.result&&['preview','confirmed'].includes(row.state))return row.result;
 if(input.action==='cancel'){
  const stopped=await db.query("UPDATE alexa_conversations SET state='cancelled' WHERE id=$1 AND state IN ('quoting','quoted') RETURNING id",[row.id]);
  return stopped.rows.length?reply('I stopped this taxi request.'):reply('This booking may already be processing. Check the app before making another request.');
 }
 if(['confirming','unknown'].includes(row.state)){
  if(row.quote_id){const attempt=await readLiveAttempt(bookingAttemptDatabase(),row.quote_id,customer.id);if(attempt&&!attempt.pending&&!attempt.rejected)return reply('Your taxi is booked. Check the app for the booking details.');}
  return reply('This booking is awaiting confirmation. Please check the app or contact the operator before trying again.');
 }
 if(row.state!=='quoted'||row.mode!==config.mode||new Date(row.expires_at).getTime()<=Date.now()||!row.quote_token)return reply('That quote has expired or changed. Please ask for a new fare.');
 const claim=await db.query("UPDATE alexa_conversations SET state='confirming' WHERE id=$1 AND state='quoted' AND expires_at>now() RETURNING id",[row.id]);
 if(!claim.rows.length)return reply('This request is already being processed. Please check the app.');
 try{
  const quote=openAutocabQuote(row.quote_token);
  if(config.mode==='preview'){
   const result=reply('Test complete. No taxi has been booked.','preview');await db.query("UPDATE alexa_conversations SET state='preview',result=$2::jsonb WHERE id=$1",[row.id,JSON.stringify(result)]);return result;
  }
  const attempts=bookingAttemptDatabase(),existing=await readLiveAttempt(attempts,quote.id,customer.id);
  if(existing){const result=reply(existing.pending?'Your booking is awaiting confirmation. Check the app before booking again.':existing.rejected?'The operator did not accept this booking. Please use the app.':'Your taxi is booked. Check the app for the booking details.',existing.pending?'pending':'ended');await db.query("UPDATE alexa_conversations SET state=$2,result=$3::jsonb WHERE id=$1",[row.id,existing.pending?'unknown':'confirmed',JSON.stringify(result)]);return result;}
  const uncertain=await attempts.query("SELECT quote_id FROM web_booking_attempts WHERE user_id=$1 AND state IN ('sending','unknown') LIMIT 1",[customer.id]);if(uncertain.rows.length)throw Error('PENDING_BOOKING');
  const refreshedRequest=await recheckAutocabFare(quote);
  const request=directBookingBody(quote,refreshedRequest,{name:customer.fullName,telephoneNumber:customer.phone,customerEmail:customer.email});
  const booked=await submitDirectAutocabBooking(attempts,quote,customer.id,request);
  const result=reply(booked.pending?'Your booking is awaiting confirmation. Check the app before booking again.':booked.rejected?'The operator did not accept this booking. Please use the app.':'Your taxi is booked. Check the app for the booking details.',booked.pending?'pending':'ended');
  await db.query("UPDATE alexa_conversations SET state=$2,result=$3::jsonb WHERE id=$1",[row.id,booked.pending?'unknown':'confirmed',JSON.stringify(result)]);return result;
 }catch(error){
  if(error instanceof Error&&['AUTOCAB_FARE_CHANGED','ALEXA_AUTOCAB_QUOTE_CHANGED'].includes(error.message)){await db.query("UPDATE alexa_conversations SET state='cancelled' WHERE id=$1 AND state='confirming'",[row.id]);return reply('The fare or quote changed. Please ask for a new quote before confirming.');}
  await db.query("UPDATE alexa_conversations SET state='unknown' WHERE id=$1 AND state='confirming'",[row.id]);
  return reply('I could not confirm this request. Please check the app or contact the operator before booking again.');
 }
}
