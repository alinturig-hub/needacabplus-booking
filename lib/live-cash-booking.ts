import type {Pool} from 'pg';
import type {FareQuote} from './quotes';
import type {buildLiveCashBookingRequest} from './autocab-booking-request';
type RequestBody=ReturnType<typeof buildLiveCashBookingRequest>;
type Attempt={quote_id:string;state:string;external_booking_id:string|null};
export function attemptResult(row:Attempt){return {id:row.quote_id,status:row.state==='confirmed'?'Booked':row.state==='rejected'?'Booking not created':'Pending confirmation',live:true,pending:row.state==='sending'||row.state==='unknown',rejected:row.state==='rejected',...(row.state==='rejected'?{error:'The operator did not accept this booking. Contact the operator or request a new quote.'}:{}),externalBookingId:row.external_booking_id}}
export async function readLiveAttempt(db:Pool,id:string,userId:string){const result=await db.query<Attempt>('SELECT quote_id,state,external_booking_id FROM web_booking_attempts WHERE quote_id=$1 AND user_id=$2',[id,userId]);return result.rows[0]?attemptResult(result.rows[0]):null}
export async function submitLiveCashBooking(db:Pool,quote:FareQuote,userId:string,body:RequestBody,send:(body:RequestBody)=>Promise<unknown>){
 // Commit the claim before the network call. Never replay an uncertain remote creation.
 const claim=await db.query("INSERT INTO web_booking_attempts(quote_id,user_id,state,request_body) VALUES($1,$2,'sending',$3::jsonb) ON CONFLICT(quote_id) DO NOTHING RETURNING quote_id",[quote.id,userId,JSON.stringify(body)]);
 if(!claim.rows.length){const existing=await readLiveAttempt(db,quote.id,userId);if(existing)return existing;throw new Error('This quote has already been used.');}
 try{
  const response=await send(body) as {bookingId?:unknown};
  if(!response||!Number.isSafeInteger(response.bookingId)||Number(response.bookingId)<=0)throw new Error('Missing booking ID');
  const externalId=String(response.bookingId);
  await db.query(`UPDATE web_booking_attempts SET state='confirmed',external_booking_id=$2,updated_at=now() WHERE quote_id=$1`,[quote.id,externalId]);
  // An early webhook may already have created this row. Preserve its newer journey status.
  await db.query(`INSERT INTO bookings(id,user_id,name,phone,pickup,destination,via_points,pickup_note,vehicle,fare_pence,status,source,payment_type,external_booking_id,customer_email,passengers,luggage,pickup_data,destination_data,vias_data,pricing_data,timeline_data,notes_data)
 VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,'Booked','WebApp','Cash',$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb)
 ON CONFLICT(external_booking_id) WHERE external_booking_id IS NOT NULL DO UPDATE SET user_id=EXCLUDED.user_id`,[quote.id,userId,body.name,body.telephoneNumber,quote.pickup,quote.destination,JSON.stringify(quote.vias),body.driverNote,quote.vehicle,quote.totalPence,externalId,body.customerEmail,Number(body.passengers),body.luggage,JSON.stringify(body.pickup.address),JSON.stringify(body.destination.address),JSON.stringify(body.vias),JSON.stringify({...body.pricing,testBooking:false}),JSON.stringify({bookedAt:new Date().toISOString(),scheduledAt:body.pickupDueTimeUtc}),JSON.stringify({ourReference:body.ourReference})]);
 }catch(error){
  const status=error&&typeof error==='object'&&'status' in error?Number(error.status):0;
  const state=[400,401,403,404].includes(status)?'rejected':'unknown';
  await db.query(`UPDATE web_booking_attempts SET state=$2,updated_at=now() WHERE quote_id=$1 AND state='sending'`,[quote.id,state]);
 }
 return (await readLiveAttempt(db,quote.id,userId))!;
}
