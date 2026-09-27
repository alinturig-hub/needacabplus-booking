import {database} from '@/lib/database';
import {isAdmin,unavailable} from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const db=database();
  const [jobs,events,fleet,totals]=await Promise.all([
   db.query(`SELECT id,external_booking_id AS reference,pickup,destination,status,COALESCE(timeline_data->>'scheduledAt',pickup_data->>'dueTime') AS due_at,COALESCE(vehicle_data->>'callsign',vehicle_data->>'id',vehicle_data->>'vehicleId') AS vehicle,updated_at,last_event_type,
    COALESCE(driver_data->>'id',driver_data->>'driverId','')<>'' OR COALESCE(vehicle_data->>'id',vehicle_data->>'vehicleId','')<>'' AS assigned
    FROM bookings WHERE external_booking_id IS NOT NULL AND COALESCE(pricing_data->>'testBooking','false')<>'true' AND status NOT IN ('Completed','Cancelled','No Fare') ORDER BY updated_at DESC LIMIT 100`),
   db.query(`SELECT id,event_type,booking_id,vehicle_id,driver_id,received_at FROM dispatch_observations ORDER BY received_at DESC,id DESC LIMIT 100`),
   db.query(`WITH latest AS (SELECT DISTINCT ON (vehicle_id) vehicle_id,vehicle_status,recorded_at FROM driver_positions WHERE vehicle_id IS NOT NULL AND recorded_at>=now()-interval '2 minutes' ORDER BY vehicle_id,recorded_at DESC NULLS LAST,id DESC)
    SELECT count(*) FILTER(WHERE lower(trim(vehicle_status))='clear' AND recorded_at>=now()-interval '2 minutes' AND recorded_at<=now()+interval '30 seconds')::int AS clear, max(recorded_at) FILTER(WHERE recorded_at<=now()+interval '30 seconds') AS last_track FROM latest`),
   db.query(`SELECT count(*)::int AS active FROM bookings WHERE external_booking_id IS NOT NULL AND COALESCE(pricing_data->>'testBooking','false')<>'true' AND status NOT IN ('Completed','Cancelled','No Fare')`)
  ]);
  return Response.json({jobs:jobs.rows,events:events.rows,fleet:fleet.rows[0],activeTotal:totals.rows[0]?.active||0,serverTime:new Date().toISOString(),simulationOnly:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
