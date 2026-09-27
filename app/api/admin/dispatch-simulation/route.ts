import {z} from 'zod';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {simulateDispatch,simulationDefaults,dispatchEventKind} from '@/lib/dispatch-simulation';
import {milesBetween,roadDurations,validPoint,trackEstimate} from '@/lib/dispatch-routing';

export const dynamic='force-dynamic';
const eligible=`external_booking_id IS NOT NULL AND status IN ('Booked','Created','Modified','Running Late') AND COALESCE(pricing_data->>'testBooking','false')<>'true' AND COALESCE(driver_data->>'id',driver_data->>'driverId','')='' AND COALESCE(vehicle_data->>'id',vehicle_data->>'vehicleId','')=''`;
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const db=database();
  const [bookings,events]=await Promise.all([
   db.query(`SELECT id,external_booking_id,pickup,timeline_data->>'scheduledAt' AS scheduled_at,pickup_data->>'dueTime' AS due_time FROM bookings WHERE ${eligible} ORDER BY updated_at DESC LIMIT 100`),
   db.query(`SELECT event_type,event_url_suffix,received_count,last_received_at,w.enabled AND p.enabled AS enabled FROM provider_webhooks w JOIN webhook_providers p ON p.id=w.provider_id WHERE event_url_suffix IN ('/booking_dispatch','/booking_accepted','/booking_rejected')`)
  ]);
  return Response.json({bookings:bookings.rows,webhooks:events.rows.map(row=>({...row,kind:dispatchEventKind(row.event_type)})),roadTimesConfigured:Boolean(process.env.DISPATCH_OSRM_URL),simulationOnly:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let id:string;try{id=z.object({bookingId:z.string().uuid()}).strict().parse(await request.json()).bookingId}catch{return Response.json({error:'Choose a booking.'},{status:400})}
 try{
  const db=database();
  const [bookings,settings]=await Promise.all([db.query(`SELECT * FROM bookings WHERE id=$1 AND ${eligible}`,[id]),db.query("SELECT settings FROM operations_settings WHERE id='dispatch'")]);
  const booking=bookings.rows[0];if(!booking)return Response.json({error:'This booking is no longer awaiting dispatch. Refresh the list.'},{status:409});
  const rules={...simulationDefaults,...settings.rows[0]?.settings?.simulation};
  const due=Date.parse(booking.timeline_data?.scheduledAt||booking.pickup_data?.dueTime||'');
  const pickup=booking.pickup_data;
  if(!pickup||!validPoint(pickup)||!Number.isFinite(due))return Response.json({error:'This booking needs a valid pickup position and pickup time.'},{status:422});
  const raw=booking.raw_payload;
  const detail=raw?.booking||raw?.metadata||raw?.data?.booking||raw?.data?.metadata||raw?.data||raw;
  // Do not assume a standard vehicle when capability requirements are unknown.
  if(!Array.isArray(detail?.capabilities)||detail.capabilities.length)return Response.json({error:'Capability requirements for this booking need verification before a vehicle can be recommended. Use the example simulator for now.'},{status:422});
  const cars=await db.query(`WITH driver_latest AS (SELECT DISTINCT ON (driver_id) * FROM driver_positions ORDER BY driver_id,recorded_at DESC NULLS LAST,id DESC), latest AS (
   SELECT DISTINCT ON (vehicle_id) * FROM driver_latest WHERE vehicle_id IS NOT NULL ORDER BY vehicle_id,recorded_at DESC NULLS LAST,id DESC
  ) SELECT l.*,v.callsign FROM latest l JOIN autocab_vehicles v ON v.external_id=l.vehicle_id JOIN autocab_drivers d ON d.external_id=l.driver_id JOIN driver_shifts s ON s.driver_id=l.driver_id
  WHERE lower(trim(l.vehicle_status))='clear' AND l.recorded_at>=now()-interval '2 minutes' AND l.recorded_at<=now()+interval '30 seconds'
  AND COALESCE(l.booking_id,0)=0 AND v.suspended=false AND d.suspended=false AND s.started_at IS NOT NULL AND (s.ended_at IS NULL OR s.started_at>s.ended_at)
  AND (lower(trim(v.company)) LIKE 'taxi services (plymouth) ltd%' OR lower(trim(v.company)) LIKE 'plymouth taxi%')
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.status IN ('Dispatched','Driver Accepted','Arrived','Passenger On Board') AND (COALESCE(b.vehicle_data->>'id',b.vehicle_data->>'vehicleId')=l.vehicle_id OR COALESCE(b.driver_data->>'id',b.driver_data->>'driverId')=l.driver_id))`);
  const radius=Number(settings.rows[0]?.settings?.maximumRadiusMiles)||8;
  const candidates=cars.rows.filter(car=>validPoint(car)&&/^\d+$/.test(car.vehicle_id)&&milesBetween(car,pickup)<=radius).sort((a,b)=>milesBetween(a,pickup)-milesBetween(b,pickup)).slice(0,20);
  let durations:(number|null)[];
  const estimates=new Map<string,ReturnType<typeof trackEstimate>>();
  if(process.env.DISPATCH_OSRM_URL)durations=await roadDurations(candidates,pickup);
  else{
   const history=candidates.length?await db.query(`SELECT vehicle_id,driver_id,latitude,longitude,recorded_at FROM driver_positions WHERE vehicle_id=ANY($1::text[]) AND recorded_at>=now()-interval '10 minutes' AND recorded_at<=now() ORDER BY recorded_at`,[candidates.map(car=>car.vehicle_id)]):{rows:[]};
   durations=candidates.map(car=>{
    const samples=history.rows.filter(p=>p.vehicle_id===car.vehicle_id&&p.driver_id===car.driver_id).map(p=>({...p,at:new Date(p.recorded_at).getTime()}));
    const estimate=trackEstimate(car,pickup,samples,rules.fallbackSpeedMph,rules.detourFactor);estimates.set(car.vehicle_id,estimate);return estimate.etaSeconds;
   });
  }
  const now=Date.now();
  const result=simulateDispatch(due,now,candidates.flatMap((car,index)=>durations[index]===null?[]:[{vehicleId:car.vehicle_id,label:`${car.callsign||car.vehicle_callsign||car.vehicle_id}${estimates.has(car.vehicle_id)?' · '+estimates.get(car.vehicle_id)!.basis:''}`,etaSeconds:durations[index]!}]),rules);
  return Response.json({result,analysis:{eligibleVehicles:cars.rows.length,nearbyVehicles:candidates.length,usableEtas:durations.filter(value=>value!==null).length,radiusMiles:radius,arrivalMinutes:rules.arrivalMinutes,bufferMinutes:rules.bufferMinutes,offerSeconds:rules.offerSeconds},calculatedAt:new Date(now).toISOString(),simulationOnly:true,note:process.env.DISPATCH_OSRM_URL?'Road estimate without live traffic. Snapshot only; vehicles are not reserved. Up to 20 nearby vehicles checked.':'Approximate ETA from GPS distance, a road-distance allowance and recent moving tracks (or your configured speed). No road routing or live traffic. Simulation only; vehicles are not reserved.'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Simulation unavailable.'},{status:503})}
}
