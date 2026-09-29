import {loadBookingPolicy} from '@/lib/app-configuration';
import {validateBookingPayment} from '@/lib/booking-payments';
import {buildLiveCashBookingRequest} from '@/lib/autocab-booking-request';
import {createCashBooking} from '@/lib/autocab-api';
import {readLiveAttempt,submitLiveCashBooking} from '@/lib/live-cash-booking';
import {livePassengerSql} from '@/lib/booking-live-summary';
import {bookingPeriod,bookingCsv} from '@/lib/booking-period';
import {z} from 'zod';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {verifyQuote,loadQuotePolicy} from '@/lib/quotes';
import {validateSchedule} from '@/lib/quote-policy';
import {getCustomer} from '@/lib/customer-auth';

export const dynamic='force-dynamic';
const payload=z.object({id:z.string().uuid(),quoteToken:z.string().max(64000),name:z.string().trim().min(2).max(100),phone:z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/),pickup:z.string().trim().min(5).max(250),destination:z.string().trim().min(5).max(250),viaPoints:z.array(z.string().trim().min(5).max(250)).max(3),pickupNote:z.string().trim().max(300),vehicle:z.enum(['saloon','estate','xl']),passengers:z.number().int().min(1).max(6).default(1),luggage:z.number().int().min(0).max(20).default(0),acknowledged:z.literal(true)}).strict();

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 let body;try{body=payload.parse(await request.json())}catch{return Response.json({error:'Check the addresses, name, phone number and booking acknowledgement.'},{status:400})}
 const stops=[body.pickup,...body.viaPoints,body.destination].map(stop=>stop.toLowerCase());if(new Set(stops).size!==stops.length)return Response.json({error:'Each stop must use a different address.'},{status:400});
 try{
 const customer=await getCustomer();if(!customer)return Response.json({error:'Sign in before confirming your booking.'},{status:401});
 const existingLive=await readLiveAttempt(database(),body.id,customer.id);if(existingLive)return Response.json(existingLive,{status:existingLive.rejected?422:existingLive.pending?202:200});
 let quote;try{quote=verifyQuote(body.quoteToken);const policy=await loadQuotePolicy();if(!policy.enabled)throw new Error('Live quotes are currently unavailable.');validateSchedule(quote.service,quote.scheduledAt,policy.minPrebookMinutes);validateBookingPayment(await loadBookingPolicy(),quote.paymentMethod||'card',Boolean(quote.liveBooking))}catch(error){return Response.json({error:error instanceof Error?error.message:'Request a new fare.'},{status:409})}
 if(body.id!==quote.id||body.vehicle!==quote.vehicle||body.pickup!==quote.pickup||body.destination!==quote.destination||JSON.stringify(body.viaPoints)!==JSON.stringify(quote.vias))return Response.json({error:'The journey changed. Request a new quote.'},{status:409});
 const db=database();const existing=await db.query<{id:string;status:string}>('SELECT id,status FROM bookings WHERE id=$1 AND user_id=$2',[body.id,customer.id]);if(existing.rows[0])return Response.json(existing.rows[0]);
 if(quote.liveBooking){
 const uncertain=await db.query("SELECT quote_id FROM web_booking_attempts WHERE user_id=$1 AND state IN ('sending','unknown') LIMIT 1",[customer.id]);
 if(uncertain.rows.length)return Response.json({error:'An earlier booking is awaiting confirmation. Please contact the operator before booking again.'},{status:409});
 let requestBody;try{requestBody=buildLiveCashBookingRequest(quote,{name:body.name,telephoneNumber:body.phone,customerEmail:customer.email,passengers:body.passengers,luggage:body.luggage,driverNote:body.pickupNote})}catch(e){return Response.json({error:e instanceof Error?e.message:'Request a new quote.'},{status:409})}
 const result=await submitLiveCashBooking(db,quote,customer.id,requestBody,createCashBooking);return Response.json(result,{status:result.rejected?422:result.pending?202:201});
 }
 const inserted=await db.query(`INSERT INTO bookings (id,user_id,name,phone,pickup,destination,via_points,pickup_note,vehicle,fare_pence,status,created_at,source,payment_type,passengers,updated_at,pricing_data,timeline_data,booking_type,pickup_data,destination_data,vias_data)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Booked',now(),'WebApp',$18,$17,now(),$11::jsonb,$12::jsonb,$13,$14::jsonb,$15::jsonb,$16::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id`,[body.id,customer.id,body.name,body.phone,quote.pickup,quote.destination,JSON.stringify(quote.vias),body.pickupNote,quote.vehicle,quote.totalPence,JSON.stringify({...quote,price:quote.totalPence/100,pricingSource:quote.service==='priority'?'Autocab + Priority':'Autocab + Guarantee',testBooking:true}),JSON.stringify({bookedAt:new Date().toISOString(),scheduledAt:quote.scheduledAt||new Date(Date.now()+(quote.bookingRules?.priorityDelayMinutes||0)*60000).toISOString()}),quote.service==='priority'?'ASAP Priority':'Guarantee Prebook',JSON.stringify(quote.autocabRequest?.pickup.address||{}),JSON.stringify(quote.autocabRequest?.destination.address||{}),JSON.stringify(quote.autocabRequest?.vias||[]),Number(quote.autocabRequest?.passengers||1),quote.paymentMethod==='cash'?'Cash':'Card']);
 if(!inserted.rowCount){const same=await db.query('SELECT id,status FROM bookings WHERE id=$1 AND user_id=$2',[body.id,customer.id]);if(same.rows[0])return Response.json(same.rows[0]);return Response.json({error:'This quote has already been used. Request another quote.'},{status:409})}
 return Response.json({id:body.id,status:'Booked'},{status:201});}catch(error){return unavailable(error)}
}

export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const searchParams=new URL(request.url).searchParams;
  let period;try{period=bookingPeriod(searchParams)}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid date range.'},{status:400})}
  const exporting=searchParams.get('export')==='csv';
  const page=Math.max(1,Number.parseInt(searchParams.get('page')||'1',10)||1);
  const requestedSize=Number.parseInt(searchParams.get('pageSize')||'20',10);
  const pageSize=[10,20,50,100].includes(requestedSize)?requestedSize:20;
  const search=(searchParams.get('search')||'').trim().slice(0,120);
  const selectedStatuses=[...new Set(searchParams.getAll('status').map(value=>value.trim().slice(0,60)).filter(Boolean))].slice(0,50);
  const source=(searchParams.get('source')||'').trim().slice(0,100);
  const payment=(searchParams.get('payment')||'').trim().slice(0,100);
  const values:string[]=[];const conditions:string[]=[];
  if(search){values.push(`%${search}%`);const index=values.length;conditions.push(`(COALESCE(external_booking_id,'') ILIKE $${index} OR COALESCE(original_booking_id,'') ILIKE $${index} OR name ILIKE $${index} OR phone ILIKE $${index} OR pickup ILIKE $${index} OR destination ILIKE $${index} OR COALESCE(driver_data::text,'') ILIKE $${index} OR COALESCE(vehicle_data::text,'') ILIKE $${index})`)}
  if(selectedStatuses.length){const placeholders=selectedStatuses.map(status=>{values.push(status);return '$'+values.length});conditions.push(`status IN (${placeholders.join(',')})`)}
  if(source){values.push(source);conditions.push(`source=$${values.length}`)}
  if(payment){values.push(payment);conditions.push(`payment_type=$${values.length}`)}
  if(period.start&&period.end){values.push(period.start,period.end);conditions.push(`booking_pickup_day(timeline_data,pickup_data) BETWEEN $${values.length-1}::date AND $${values.length}::date`)}
  if(period.period==='custom'){values.push(period.start+'T'+period.fromTime,period.end+'T'+period.toTime);conditions.push(`booking_pickup_local_time(timeline_data,pickup_data)>=$${values.length-1}::timestamp AND booking_pickup_local_time(timeline_data,pickup_data)<$${values.length}::timestamp+interval '1 minute'`)}
  const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
  const db=database();
  if(exporting){const rows=await db.query(`SELECT external_booking_id,name,phone,status,pickup,destination,source,payment_type,booking_pickup_day(timeline_data,pickup_data)::text AS pickup_day FROM bookings ${where} ORDER BY updated_at DESC,id`,values);return new Response(bookingCsv(rows.rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="need-a-cab-bookings.csv"','Cache-Control':'no-store'}})}
  const needACabPlusOrigin=`(COALESCE(source='WebApp',false) OR COALESCE(COALESCE(notes_data->>'ourReference',raw_payload#>>'{booking,ourReference}',raw_payload#>>'{metadata,ourReference}',raw_payload#>>'{data,booking,ourReference}',raw_payload#>>'{data,metadata,ourReference}',raw_payload#>>'{data,ourReference}',raw_payload->>'ourReference') ~* '^NAC-',false))`;
  const prebookType=`COALESCE(booking_type,raw_payload#>>'{booking,typeOfBooking}',raw_payload#>>'{booking,bookingType}',raw_payload#>>'{metadata,typeOfBooking}',raw_payload#>>'{metadata,bookingType}',raw_payload#>>'{data,booking,typeOfBooking}',raw_payload#>>'{data,booking,bookingType}',raw_payload->>'typeOfBooking',raw_payload->>'bookingType','')`;
  const prebookFlag=`lower(COALESCE(raw_payload#>>'{booking,isPreBooking}',raw_payload#>>'{metadata,isPreBooking}',raw_payload#>>'{data,booking,isPreBooking}',raw_payload->>'isPreBooking','false')) IN ('true','1','yes')`;
  const prebookBooking=`(${prebookType} ~* '(pre.?book|advance|guarantee|scheduled|future)' OR ${prebookFlag})`;
  const [countResult,summaryResult,originResult,sourceResult,paymentResult,statusResult,liveResult]=await Promise.all([
   db.query<{total:string}>(`SELECT COUNT(*)::text AS total FROM bookings ${where}`,values),
   db.query<{status:string;total:string}>(`SELECT status,COUNT(*)::text AS total FROM bookings ${where} GROUP BY status`,values),
   db.query<{need_a_cab_plus:string;autocab:string;asap:string;prebook:string}>(`SELECT COUNT(*) FILTER(WHERE ${needACabPlusOrigin})::text AS need_a_cab_plus,COUNT(*) FILTER(WHERE NOT ${needACabPlusOrigin})::text AS autocab,COUNT(*) FILTER(WHERE NOT ${prebookBooking})::text AS asap,COUNT(*) FILTER(WHERE ${prebookBooking})::text AS prebook FROM bookings ${where}`,values),
   db.query<{source:string}>('SELECT DISTINCT source FROM bookings WHERE source IS NOT NULL AND source<>\'\' ORDER BY source'),
   db.query<{payment_type:string}>('SELECT DISTINCT payment_type FROM bookings WHERE payment_type IS NOT NULL AND payment_type<>\'\' ORDER BY payment_type'),
   db.query<{status:string}>('SELECT DISTINCT status FROM bookings ORDER BY status'),
   db.query<{total:string}>(livePassengerSql)
  ]);
  const total=Number(countResult.rows[0]?.total||0);const totalPages=Math.max(1,Math.ceil(total/pageSize));const safePage=Math.min(page,totalPages);
  const dataValues:[...string[],number,number]=[...values,pageSize,(safePage-1)*pageSize];
  const result=await db.query(`SELECT id,external_booking_id,original_booking_id,name,phone,customer_email,passengers,luggage,
  pickup,destination,via_points,pickup_note,pickup_data,destination_data,vias_data,driver_data,vehicle_data,pricing_data,timeline_data,notes_data,
  booking_type,source,payment_type,priority,street_pickup,vehicle,fare_pence,status,last_event_type,raw_payload,created_at,updated_at
  ,booking_pickup_day(timeline_data,pickup_data)::text AS pickup_day FROM bookings ${where} ORDER BY updated_at DESC,created_at DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,dataValues);
  const pastPeriod=Boolean(period.end&&period.end<bookingPeriod(new URLSearchParams()).start!);
  const summary=Object.fromEntries(summaryResult.rows.map(row=>[row.status,Number(row.total)]));
  const origin=originResult.rows[0];
  return Response.json({pastPeriod,bookings:result.rows,total,page:safePage,pageSize,summary,originSummary:{autocab:Number(origin?.autocab||0),needACabPlus:Number(origin?.need_a_cab_plus||0)},timingSummary:{asap:Number(origin?.asap||0),prebook:Number(origin?.prebook||0)},livePassengerOnBoard:Number(liveResult.rows[0]?.total||0),period,statuses:statusResult.rows.map(row=>row.status),sources:sourceResult.rows.map(row=>row.source),payments:paymentResult.rows.map(row=>row.payment_type)},{headers:{'Cache-Control':'no-store'}})
 }catch(error){return unavailable(error)}
}

const allowedStatuses=['Booked','Modified','Dispatched','Driver Accepted','Arrived','Passenger On Board','Running Late','Completed','Cancelled','Rejected','No Fare'] as const;
export async function PATCH(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let body;try{body=z.object({id:z.string().uuid(),status:z.enum(allowedStatuses)}).strict().parse(await request.json())}catch{return Response.json({error:'Invalid booking update.'},{status:400})}
 try{const result=await database().query('UPDATE bookings SET status=$1,updated_at=now() WHERE id=$2',[body.status,body.id]);if(!result.rowCount)return Response.json({error:'Booking not found.'},{status:404});return Response.json({ok:true})}catch(error){return unavailable(error)}
}
