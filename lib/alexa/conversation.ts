import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database,bookingAttemptDatabase} from '../database';
import {calculateQuote,quoteRequestSchema,verifyQuote,loadQuotePolicy,activePaidMembership} from '../quotes';
import {signQuote} from '../quote-token';
import {loadBookingPolicy} from '../app-configuration';
import {bookingServiceAccess} from '../booking-policy';
import {validateBookingPayment} from '../booking-payments';
import {validateSchedule} from '../quote-policy';
import {requireAutocabIntegration} from '../integration-control';
import {buildLiveCashBookingRequest} from '../autocab-booking-request';
import {createCashBooking} from '../autocab-api';
import {readLiveAttempt,submitLiveCashBooking} from '../live-cash-booking';
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
  if(prior)return prior.state==='quoted'&&new Date(prior.expires_at).getTime()>Date.now()?reply(prior.speech!,'quoted',prior.id):reply('That request has ended. Please ask for a new quote.');
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
   const quote=await calculateQuote(quoteRequestSchema.parse({pickup:{...pickup.full_address,text:pickup.address} as Parameters<typeof calculateQuote>[0]['pickup'],destination:{...destination.full_address,text:destination.address} as Parameters<typeof calculateQuote>[0]['destination'],vias:[],vehicle:'saloon',service:'asap',paymentMethod:'cash',scheduledAt:null}),customer.id);
   if(config.mode==='live'&&!quote.liveBooking)throw Error('LIVE_BOOKINGS_DISABLED');
   const speech=fareSpeech(quote.pickup,quote.destination,quote.totalPence,config.mode);
   const saved=await db.query("UPDATE alexa_conversations SET quote_token=$2,speech=$3,state='quoted',expires_at=LEAST(expires_at,$4::timestamptz),quote_id=$5 WHERE id=$1 AND state='quoting' RETURNING id",[id,signQuote(quote),speech,quote.expiresAt,quote.id]);
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
  const quote=verifyQuote(row.quote_token);
  if(config.mode==='preview'){
   const result=reply('Test complete. No taxi has been booked.','preview');await db.query("UPDATE alexa_conversations SET state='preview',result=$2::jsonb WHERE id=$1",[row.id,JSON.stringify(result)]);return result;
  }
  await requireAutocabIntegration();
  const [policy,rules]=await Promise.all([loadQuotePolicy(),loadBookingPolicy()]);
  if(!policy.enabled||!quote.liveBooking||quote.service!=='asap'||quote.vehicle!=='saloon'||quote.paymentMethod!=='cash'||quote.vias.length||quote.ebooker)throw Error('BOOKING_CHANGED');
  const paid=Boolean(await activePaidMembership(customer.id,policy)),access=bookingServiceAccess(rules,paid);
  if(!access.asap||quote.smartFare?.applied&&!access.quietAsap||quote.membership&&!paid)throw Error('MEMBERSHIP_CHANGED');
  validateSchedule(quote.service,quote.scheduledAt,policy.minPrebookMinutes);validateBookingPayment(rules,'cash',true);
  const attempts=bookingAttemptDatabase(),existing=await readLiveAttempt(attempts,quote.id,customer.id);
  if(existing){const result=reply(existing.pending?'Your booking is awaiting confirmation. Check the app before booking again.':existing.rejected?'The operator did not accept this booking. Please use the app.':'Your taxi is booked. Check the app for the booking details.',existing.pending?'pending':'ended');await db.query("UPDATE alexa_conversations SET state=$2,result=$3::jsonb WHERE id=$1",[row.id,existing.pending?'unknown':'confirmed',JSON.stringify(result)]);return result;}
  const uncertain=await attempts.query("SELECT quote_id FROM web_booking_attempts WHERE user_id=$1 AND state IN ('sending','unknown') LIMIT 1",[customer.id]);if(uncertain.rows.length)throw Error('PENDING_BOOKING');
  const request=buildLiveCashBookingRequest(quote,{name:customer.fullName,telephoneNumber:customer.phone,customerEmail:customer.email,passengers:1,luggage:0,driverNote:'Booked using Alexa. One passenger; no luggage specified.'});
  const booked=await submitLiveCashBooking(attempts,quote,customer.id,request,createCashBooking);
  const result=reply(booked.pending?'Your booking is awaiting confirmation. Check the app before booking again.':booked.rejected?'The operator did not accept this booking. Please use the app.':'Your taxi is booked. Check the app for the booking details.',booked.pending?'pending':'ended');
  await db.query("UPDATE alexa_conversations SET state=$2,result=$3::jsonb WHERE id=$1",[row.id,booked.pending?'unknown':'confirmed',JSON.stringify(result)]);return result;
 }catch{
  await db.query("UPDATE alexa_conversations SET state='unknown' WHERE id=$1 AND state='confirming'",[row.id]);
  return reply('I could not confirm this request. Please check the app or contact the operator before booking again.');
 }
}
