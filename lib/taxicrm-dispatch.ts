import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';
import {normalizedStatus} from '@/lib/taxicrm-bookings';
import {taxiCrmFleetFreshness} from '@/lib/taxicrm-live';

type JobRow={id:string;reference:string|null;pickup:string|null;destination:string|null;pickup_zone:string|null;status:string;due_at:Date|string|null;vehicle:string|null;updated_at:Date|string;driver_id:string|null;vehicle_id:string|null};
type EventRow={id:string;event_type:string;booking_id:string|null;vehicle_id:string|null;driver_id:string|null;driver_callsign:string|null;vehicle_callsign:string|null;received_at:Date|string};

export async function taxiCrmDispatchLive(){
 const [bookingData,fleet]=await Promise.all([withTaxiCrmReadOnly(async client=>{
  const jobs=await client.query<JobRow>(`SELECT booking.id,booking."externalId" reference,pickup.address pickup,destination.address destination,
   COALESCE(NULLIF(to_jsonb(pickup)->>'zoneName',''),NULLIF(to_jsonb(pickup)->>'plotZoneName',''),NULLIF(to_jsonb(pickup)->>'zone',''),NULLIF(to_jsonb(pickup)->>'zoneId','')) pickup_zone,booking.status,
   booking."pickupDueTime" due_at,booking."vehicleCallSign" vehicle,booking."updatedAt" updated_at,booking."driverId" driver_id,booking."vehicleId" vehicle_id
   FROM public."Booking" booking
   LEFT JOIN public."BookingLocation" pickup ON pickup."bookingId"=booking.id AND pickup.type::text='PICKUP'
   LEFT JOIN public."BookingLocation" destination ON destination."bookingId"=booking.id AND destination.type::text='DESTINATION'
   WHERE booking.status NOT IN ('COMPLETED','CANCELLED','REJECTED','NO_FARE','NOFARE')
    AND booking."pickupDueTime" BETWEEN now()-interval '6 hours' AND now()+interval '48 hours'
   ORDER BY booking."pickupDueTime" ASC,booking."updatedAt" DESC LIMIT 500`);
  const ids=jobs.rows.map(row=>row.id);
  const events=ids.length?await client.query<EventRow>(`SELECT event.id,event."eventType" event_type,booking."externalId" booking_id,
   booking."vehicleId" vehicle_id,booking."driverId" driver_id,booking."driverCallSign" driver_callsign,booking."vehicleCallSign" vehicle_callsign,event."occurredAt" received_at
   FROM public."BookingTimelineEvent" event JOIN public."Booking" booking ON booking.id=event."bookingId"
   WHERE event."bookingId"=ANY($1::text[]) ORDER BY event."occurredAt" DESC LIMIT 100`,[ids]):{rows:[] as EventRow[]};
  const count=await client.query<{total:string}>(`SELECT count(*)::text total FROM public."Booking"
   WHERE status NOT IN ('COMPLETED','CANCELLED','REJECTED','NO_FARE','NOFARE')
    AND "pickupDueTime" BETWEEN now()-interval '6 hours' AND now()+interval '48 hours'`);
  return {jobs:jobs.rows,events:events.rows,activeTotal:Number(count.rows[0]?.total||0)};
 }),taxiCrmFleetFreshness()]);
 return {jobs:bookingData.jobs.map(row=>({id:row.id,reference:row.reference||row.id,pickup:row.pickup||'—',destination:row.destination||'—',pickup_zone:row.pickup_zone||null,status:normalizedStatus(row.status),due_at:row.due_at?new Date(row.due_at).toISOString():null,vehicle:row.vehicle,updated_at:new Date(row.updated_at).toISOString(),last_event_type:null,assigned:Boolean(row.driver_id||row.vehicle_id)})),
  events:bookingData.events.map(row=>({...row,received_at:new Date(row.received_at).toISOString()})),fleet,activeTotal:bookingData.activeTotal,serverTime:new Date().toISOString(),simulationOnly:true,dataSource:'taxicrm' as const};
}

export async function taxiCrmBookingStory(externalId:string){
 return withTaxiCrmReadOnly(async client=>{
  const result=await client.query<{id:string;driver_id:string|null;vehicle_id:string|null;driver_callsign:string|null;vehicle_callsign:string|null;updated_at:Date|string;accepted_at:Date|string|null;arrived_at:Date|string|null}>(`SELECT id,"driverId" driver_id,"vehicleId" vehicle_id,"driverCallSign" driver_callsign,"vehicleCallSign" vehicle_callsign,
   "updatedAt" updated_at,"acceptedAt" accepted_at,"arrivedAt" arrived_at FROM public."Booking" WHERE provider='AUTOCAB' AND "externalId"=$1 LIMIT 1`,[externalId]);
  const booking=result.rows[0];if(!booking)return null;
  const timeline=await client.query<{id:string;event_type:string;title:string;occurred_at:Date|string}>(`SELECT id,"eventType" event_type,title,"occurredAt" occurred_at FROM public."BookingTimelineEvent" WHERE "bookingId"=$1 ORDER BY "occurredAt" ASC LIMIT 1000`,[booking.id]);
  const accepted=booking.accepted_at?new Date(booking.accepted_at).getTime():NaN,arrived=booking.arrived_at?new Date(booking.arrived_at).getTime():NaN;
  const acceptToArrivalSeconds=Number.isFinite(accepted)&&Number.isFinite(arrived)&&arrived>accepted?Math.round((arrived-accepted)/1000):null;
  return {bookingId:externalId,partial:timeline.rows.length>=1000,source:'taxicrm' as const,
   currentAssignment:booking.driver_id||booking.vehicle_id?{driverId:booking.driver_id,vehicleId:booking.vehicle_id,driver:booking.driver_callsign,vehicle:booking.vehicle_callsign,checkedAt:new Date(booking.updated_at).toISOString(),source:'TaxiCRM'}:null,
   metrics:{offers:0,matchedResponses:0,offerToAcceptSeconds:null,acceptToArrivalSeconds,receiptTimed:false},
   events:timeline.rows.map(row=>({id:row.id,kind:null,event_type:row.event_type,booking_id:externalId,vehicle_id:booking.vehicle_id,driver_id:booking.driver_id,source_at:new Date(row.occurred_at).toISOString(),received_at:new Date(row.occurred_at).toISOString(),title:row.title})),recommendations:[]};
 });
}
