import {z} from 'zod';
import type {Pool} from 'pg';
import {createDirectAutocabCashBooking} from '../autocab-api';
import {readLiveAttempt} from '../live-cash-booking';
import type {AlexaAutocabQuote,AlexaAutocabRequest} from './autocab-quote';
const passenger=z.object({name:z.string().trim().min(2).max(100),telephoneNumber:z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/),customerEmail:z.string().email().max(250).optional()}).strict();
export function directBookingBody(quote:AlexaAutocabQuote,request:AlexaAutocabRequest,identity:z.infer<typeof passenger>){
 const person=passenger.parse(identity);
 // Deliberately no pricing object, manual tariff, cost override or Plus rules.
 // Autocab calculates the booking tariff itself from the quoted route/profile.
 const source=structuredClone(request);
 return {companyId:source.companyId,...(source.customerId?{customerId:source.customerId}:{}),capabilities:source.capabilities,passengers:'1',pickup:source.pickup,destination:source.destination,vias:[],pickupDueTime:source.pickupDueTime,pickupDueTimeUtc:source.pickupDueTimeUtc,driverConstraints:source.driverConstraints,vehicleConstraints:source.vehicleConstraints,...person,ourReference:'NAC-'+quote.id,bookingSource:'ThirdPartyWebsite',luggage:0,driverNote:'Booked using Alexa. One passenger; no luggage.',officeNote:'Alexa cash booking. Autocab tariff. Customer pays the driver.',hold:false};
}
export async function submitDirectAutocabBooking(db:Pool,quote:AlexaAutocabQuote,userId:string,body:ReturnType<typeof directBookingBody>,send=createDirectAutocabCashBooking){
 const claim=await db.query("INSERT INTO web_booking_attempts(quote_id,user_id,state,request_body) VALUES($1,$2,'sending',$3::jsonb) ON CONFLICT(quote_id) DO NOTHING RETURNING quote_id",[quote.id,userId,JSON.stringify(body)]);
 if(!claim.rows.length){const existing=await readLiveAttempt(db,quote.id,userId);if(!existing)throw Error('QUOTE_ALREADY_USED');return existing;}
 try{
  const response=await send(body) as {bookingId?:unknown};
  if(!Number.isSafeInteger(response?.bookingId)||Number(response.bookingId)<=0)throw Error('UNKNOWN_BOOKING_OUTCOME');
  await db.query("UPDATE web_booking_attempts SET state='confirmed',external_booking_id=$2,updated_at=now() WHERE quote_id=$1",[quote.id,String(response.bookingId)]);
 }catch(error){const status=error&&typeof error==='object'&&'status' in error?Number(error.status):0;await db.query("UPDATE web_booking_attempts SET state=$2,updated_at=now() WHERE quote_id=$1 AND state='sending'",[quote.id,[400,401,403,404].includes(status)?'rejected':'unknown']);}
 // The operator/webhook remains the booking authority. Do not create a Plus
 // booking copy or run any Plus price/payment/membership transformation.
 return (await readLiveAttempt(db,quote.id,userId))!;
}
