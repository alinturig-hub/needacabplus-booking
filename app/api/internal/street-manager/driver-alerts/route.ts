import {timingSafeEqual} from 'node:crypto';
import {database} from '@/lib/database';
import {autocabIntegrationEnabled} from '@/lib/integration-control';
import {loadAlertPlan} from '@/lib/street-manager/alert-plan';
import {claimDriverAlert} from '@/lib/street-manager/alert-delivery';
import {driverMessageConnection,sendDriverClosureMessage} from '@/lib/street-manager/driver-message';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 const secret=process.env.BOOKING_WRITER_JOB_SECRET,supplied=request.headers.get('x-booking-writer-secret');
 if(!secret||!supplied||Buffer.byteLength(secret)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(secret),Buffer.from(supplied)))return Response.json({error:'UNAUTHORIZED'},{status:401});
 const mode=process.env.ROAD_CLOSURE_ALERTS_MODE;
 if(mode!=='observe'&&mode!=='live')return Response.json({mode:'off',attempted:0});
 if(!await autocabIntegrationEnabled())return Response.json({mode,reason:'AUTOCAB_DISABLED',attempted:0});
 let client,locked=false;
 try{
  client=await database().connect();
  locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('nac:road-closure-alert-worker')) AS locked")).rows[0].locked;
  if(!locked)return Response.json({mode,reason:'WORKER_BUSY',attempted:0});
  await client.query("SET statement_timeout='8s'");
  const plan=await loadAlertPlan(client);
  if(mode==='observe')return Response.json({mode,activeClosures:plan.activeClosures,trackedDrivers:plan.trackedDrivers,candidates:plan.candidates.length,attempted:0});
  const connection=await driverMessageConnection();
  if(!connection)return Response.json({mode,reason:'DRIVER_MESSAGE_ENDPOINT_MISSING',attempted:0});
  let attempted=0,accepted=0;
  for(const candidate of plan.candidates.slice(0,3)){
   // Re-read time, road status, shift/driver identity and the latest GPS just
   // before reserving each send. Observation never creates delivery claims.
   const fresh=(await loadAlertPlan(client)).candidates.find(c=>c.driverId===candidate.driverId&&c.vehicleId===candidate.vehicleId&&c.closureKey===candidate.closureKey);
   if(!fresh)continue;
   const id=await claimDriverAlert(client,fresh);if(!id)continue;
   attempted++;
   let result:{status:string;httpStatus:number|null};
   try{result=await sendDriverClosureMessage(connection,fresh.driverId,fresh.message)}catch{result={status:'SUPPRESSED',httpStatus:null}}
   await client.query('UPDATE street_manager_driver_alerts SET status=$2,http_status=$3,completed_at=now() WHERE id=$1',[id,result.status,result.httpStatus]);
   if(result.status==='ACCEPTED')accepted++;
  }
  return Response.json({mode,activeClosures:plan.activeClosures,trackedDrivers:plan.trackedDrivers,attempted,accepted});
 }catch{return Response.json({error:'DRIVER_ALERT_WORKER_UNAVAILABLE'},{status:503})}
 finally{if(client){if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('nac:road-closure-alert-worker'))").catch(()=>{});await client.query('RESET statement_timeout').catch(()=>{});client.release()}}
}
