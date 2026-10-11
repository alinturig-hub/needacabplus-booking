import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';
import {normalizedStatus} from '@/lib/taxicrm-bookings';
import {taxiCrmFleetFreshness} from '@/lib/taxicrm-live';

type JobRow={id:string;reference:string|null;pickup:string|null;destination:string|null;status:string;due_at:Date|string|null;vehicle:string|null;updated_at:Date|string;driver_id:string|null;vehicle_id:string|null};
type EventRow={id:string;event_type:string;booking_id:string|null;vehicle_id:string|null;driver_id:string|null;driver_callsign:string|null;vehicle_callsign:string|null;received_at:Date|string};

export async function taxiCrmDispatchLive(){
 const [bookingData,fleet]=await Promise.all([withTaxiCrmReadOnly(async client=>{
  const jobs=await client.query<JobRow>(`SELECT booking.id,booking."externalId" reference,pickup.address pickup,destination.address destination,booking.status,
   booking."pickupDueTime" due_at,booking."vehicleCallSign" vehicle,booking."updatedAt" updated_at,booking."driverId" driver_id,booking."vehicleId" vehicle_id
   FROM public."Booking" booking
   LEFT JOIN public."BookingLocation" pickup ON pickup."bookingId"=booking.id AND pickup.type::text='PICKUP'
   LEFT JOIN public."BookingLocation" destination ON destination."bookingId"=booking.id AND destination.type::text='DESTINATION'
   WHERE booking.status NOT IN ('COMPLETED','CANCELLED','REJECTED','NO_FARE','NOFARE')
    AND booking."pickupDueTime" BETWEEN now()-interval '6 hours' AND now()+interval '48 hours'
   ORDER BY booking."pickupDueTime" ASC,booking."updatedAt" DESC LIMIT 100`);
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
 return {jobs:bookingData.jobs.map(row=>({id:row.id,reference:row.reference||row.id,pickup:row.pickup||'—',destination:row.destination||'—',status:normalizedStatus(row.status),due_at:row.due_at?new Date(row.due_at).toISOString():null,vehicle:row.vehicle,updated_at:new Date(row.updated_at).toISOString(),last_event_type:null,assigned:Boolean(row.driver_id||row.vehicle_id)})),
  events:bookingData.events.map(row=>({...row,received_at:new Date(row.received_at).toISOString()})),fleet,activeTotal:bookingData.activeTotal,serverTime:new Date().toISOString(),simulationOnly:true,dataSource:'taxicrm' as const};
}
