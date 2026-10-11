import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';
import {normalizedStatus} from '@/lib/taxicrm-bookings';
import {database} from '@/lib/database';

type Row={external_id:string;pickup:string|null;destination:string|null;vehicle:string|null;fare:string|number|null;status:string;booking_type:string|null;payment_type:string|null;scheduled_at:Date|string|null;created_at:Date|string};

export async function taxiCrmCustomerTrips(externalIds:string[]){
 if(!externalIds.length)return [];
 return withTaxiCrmReadOnly(async client=>{
  const result=await client.query<Row>(`SELECT booking."externalId" external_id,pickup.address pickup,destination.address destination,
   booking."vehicleCallSign" vehicle,COALESCE(booking.fare,booking.price) fare,booking.status,booking."bookingType" booking_type,
   booking."paymentType" payment_type,booking."pickupDueTime" scheduled_at,booking."createdAt" created_at
   FROM public."Booking" booking
   LEFT JOIN LATERAL (SELECT max(address) address FROM public."BookingLocation" WHERE "bookingId"=booking.id AND type::text='PICKUP') pickup ON true
   LEFT JOIN LATERAL (SELECT max(address) address FROM public."BookingLocation" WHERE "bookingId"=booking.id AND type::text='DESTINATION') destination ON true
   WHERE booking.provider='AUTOCAB' AND booking."externalId"=ANY($1::text[]) ORDER BY booking."createdAt" DESC LIMIT 30`,[externalIds]);
  return result.rows.map(row=>({externalId:row.external_id,pickup:row.pickup||'—',destination:row.destination||'—',viaPoints:[],vehicle:row.vehicle||'',farePence:row.fare===null?0:Math.round(Number(row.fare)*100),status:normalizedStatus(row.status),bookingType:row.booking_type,paymentType:row.payment_type,scheduledAt:row.scheduled_at?new Date(row.scheduled_at).toISOString():null,createdAt:new Date(row.created_at).toISOString()}));
 });
}

export async function taxiCrmBookingIdForQuote(quoteId:string,pickupDueTime:string){
 if(!Number.isFinite(Date.parse(pickupDueTime)))return null;
 return withTaxiCrmReadOnly(async client=>{
  const result=await client.query<{external_id:string|null}>(`SELECT "externalId" external_id FROM public."Booking"
   WHERE provider='AUTOCAB' AND "ourReference"=$1 AND "pickupDueTime" BETWEEN $2::timestamp-interval '1 day' AND $2::timestamp+interval '1 day'
    AND "externalId" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`,[`NAC-${quoteId}`,pickupDueTime]);
  return result.rows[0]?.external_id||null;
 });
}

export async function taxiCrmBookingLinkHealth(){
 const attempts=await database().query<{quote_id:string;external_booking_id:string}>(`SELECT quote_id,external_booking_id FROM web_booking_attempts WHERE state='confirmed' AND external_booking_id IS NOT NULL ORDER BY updated_at DESC LIMIT 20`);
 return withTaxiCrmReadOnly(async client=>{
  const references=attempts.rows.map(row=>`NAC-${row.quote_id}`),externalIds=attempts.rows.map(row=>row.external_booking_id);
  const result=await client.query<{by_reference:string;by_external_id:string}>(`SELECT count(*) FILTER(WHERE "ourReference"=ANY($1::text[]))::text by_reference,
   count(*)::text by_external_id FROM public."Booking" WHERE provider='AUTOCAB' AND "externalId"=ANY($2::text[])`,[references,externalIds]);
  return {recentConfirmedAttempts:attempts.rows.length,matchedByQuoteReference:Number(result.rows[0]?.by_reference||0),matchedByExternalId:Number(result.rows[0]?.by_external_id||0)};
 });
}

export async function taxiCrmBookingTracking(externalId:string){
 return withTaxiCrmReadOnly(async client=>{
  const result=await client.query<{id:string;status:string;driver_name:string|null;vehicle_callsign:string|null;latitude:string|number|null;longitude:string|number|null;last_seen_at:Date|string|null}>(`SELECT booking.id,booking.status,
   NULLIF(concat_ws(' ',booking."driverForename",booking."driverSurname"),'') driver_name,booking."vehicleCallSign" vehicle_callsign,
   vehicle."currentLatitude" latitude,vehicle."currentLongitude" longitude,vehicle."lastSeenAt" last_seen_at
   FROM public."Booking" booking LEFT JOIN public."Vehicle" vehicle ON vehicle.id=booking."vehicleId"
   WHERE booking.provider='AUTOCAB' AND booking."externalId"=$1 LIMIT 1`,[externalId]);
  const booking=result.rows[0];if(!booking)return null;
  const timeline=await client.query<{event_type:string;title:string;occurred_at:Date|string}>(`SELECT "eventType" event_type,title,"occurredAt" occurred_at FROM public."BookingTimelineEvent" WHERE "bookingId"=$1 ORDER BY "occurredAt" DESC LIMIT 50`,[booking.id]);
  const active=!['Completed','Cancelled','Rejected','No Fare'].includes(normalizedStatus(booking.status));
  const seen=booking.last_seen_at?new Date(booking.last_seen_at).getTime():NaN;
  const fresh=active&&Number.isFinite(seen)&&Date.now()-seen>=0&&Date.now()-seen<120000;
  return {status:normalizedStatus(booking.status),driverName:booking.driver_name,vehicleCallsign:booking.vehicle_callsign,
   vehiclePosition:fresh&&booking.latitude!==null&&booking.longitude!==null?{latitude:Number(booking.latitude),longitude:Number(booking.longitude),recordedAt:new Date(seen).toISOString()}:null,
   timeline:timeline.rows.reverse().map(row=>({eventType:row.event_type,title:row.title,occurredAt:new Date(row.occurred_at).toISOString()}))};
 });
}
