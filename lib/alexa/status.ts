import {pickupUpdateStage} from '../booking-pickup-update';
import {autocabIso} from '../autocab-time.mjs';
import {bookingAttemptDatabase} from '../database';
import {withTaxiCrmReadOnly} from '../taxicrm-database';
import {hash} from './policy';
export type TaxiSnapshot={externalId:string;customerName:string|null;status:string;driverId:string|null;vehicleId:string|null;registration:string|null;make:string|null;model:string|null;colour:string|null;updatedAt:Date|string;estimatedPickupAt?:string|null};
const clean=(v:string|null|undefined,max=80)=>(v||'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max);
export const taxiState=(s:string)=>s.toUpperCase().replace(/[^A-Z]/g,'');
export function taxiStatusSpeech(row:TaxiSnapshot,now=Date.now()){
 const name=clean(row.customerName).split(/\s+/)[0],hello=name?`Hey ${name}. `:'',state=taxiState(row.status);
 if(['CANCELLED','CANCELED','REJECTED','NOFARE','NOSHOW'].includes(state))return hello+'Your taxi booking is no longer active. Please contact the operator if you still need a taxi.';
 if(state==='COMPLETED')return hello+'Your journey has been completed.';
 if(!['ACCEPTED','ARRIVED','POB'].includes(state)||!row.driverId||!row.vehicleId)return hello+(state==='DISPATCHED'?'Your booking has been dispatched and is awaiting driver acceptance.':'Your booking is active. I do not have a confirmed vehicle allocation yet.');
 const age=now-new Date(row.updatedAt).getTime(),stale=!Number.isFinite(age)||age< -10000||age>180000;
 let speech=hello+(stale?'The last confirmed update says your taxi ': 'Your taxi ')+(state==='ARRIVED'?'is outside at your pickup.':state==='POB'?'has started the journey.':'has been dispatched and is on the way.');
 if(pickupUpdateStage(row,now)==='two_minutes')speech+=' Your taxi is estimated to be about two minutes away.';
 const description=[clean(row.colour).toLowerCase(),clean(row.make),clean(row.model)].filter(Boolean).join(' '),registration=clean(row.registration,20).replace(/\s/g,'');
 if(description)speech+=` Your vehicle is ${/^[aeiou]/i.test(description)?'an':'a'} ${description}.`;
 if(registration)speech+=' The registration is '+registration.split('').join(' ')+'.';
 else speech+=' The registration is not available yet.';
 return speech;
}
export async function canonicalTaxiSnapshot(bookingId:string):Promise<TaxiSnapshot|null>{
 if(!/^\d{1,20}$/.test(bookingId))return null;
 return withTaxiCrmReadOnly(async db=>{const row=(await db.query<TaxiSnapshot & {pickupEta?:unknown}>(`SELECT b."externalId",b."customerName",b.status,b."driverId",b."vehicleId",b."updatedAt",
 COALESCE(b."rawPayload"->>'EstimatedPickupTime',b."rawPayload"->>'estimatedPickupTime',b."rawPayload"->>'estimated_pickup_time') "pickupEta",
 COALESCE(NULLIF(trim(b."vehicleRegistration"),''),v.registration) registration,v.make,v.model,v.colour
 FROM public."Booking" b LEFT JOIN public."Vehicle" v ON v.provider='AUTOCAB' AND v."externalId"=b."vehicleId"
 AND (NULLIF(trim(b."vehicleRegistration"),'') IS NULL OR upper(regexp_replace(b."vehicleRegistration",'\\s','','g'))=upper(regexp_replace(v.registration,'\\s','','g')))
 WHERE b.provider='AUTOCAB' AND b."externalId"=$1 LIMIT 1`,[bookingId])).rows[0];if(!row)return null;const {pickupEta,...snapshot}=row;return {...snapshot,estimatedPickupAt:autocabIso(pickupEta)};});
}
const defaults={attempts:bookingAttemptDatabase,snapshot:canonicalTaxiSnapshot};
export async function alexaTaxiStatus(principal:string,services:Partial<typeof defaults>={}){
 const s={...defaults,...services};let timer:ReturnType<typeof setTimeout>|undefined;
 async function read(){
  const attempt=(await s.attempts().query<{state:string;external_booking_id:string|null}>("SELECT state,external_booking_id FROM web_booking_attempts WHERE user_id=$1 AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1",['alexa-guest:'+hash(principal)])).rows[0];
  if(!attempt)return 'I do not have a real taxi booking from this Alexa account in the last 24 hours. Test bookings do not dispatch a taxi.';
  if(attempt.state==='rejected')return 'The operator did not accept the latest taxi request. Please ask for a new quote.';
  if(attempt.state!=='confirmed'||!attempt.external_booking_id)return 'Your latest booking is awaiting confirmation. Please contact the operator before requesting another taxi.';
  const row=await s.snapshot(attempt.external_booking_id);return row?taxiStatusSpeech(row):'The booking was received, but its latest driver update is not available yet.';
 }
 try{return await Promise.race([read(),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve('I could not read the latest taxi update. Please try again or contact the operator.'),5500);})]);}catch{return 'I could not read the latest taxi update. Please try again or contact the operator.';}finally{clearTimeout(timer);}
}
