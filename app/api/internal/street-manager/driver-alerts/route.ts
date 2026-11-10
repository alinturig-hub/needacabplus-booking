import {timingSafeEqual} from 'node:crypto';
import {database} from '@/lib/database';
import {autocabIntegrationEnabled} from '@/lib/integration-control';
import {loadAlertPlan} from '@/lib/street-manager/alert-plan';
import {trafficPilot,pilotCandidates} from '@/lib/street-manager/live-scope';
import {claimDriverAlert} from '@/lib/street-manager/alert-delivery';
import {driverMessageConnection,sendDriverClosureMessage} from '@/lib/street-manager/driver-message';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 const secret=process.env.BOOKING_WRITER_JOB_SECRET,supplied=request.headers.get('x-booking-writer-secret');
 if(!secret||!supplied||Buffer.byteLength(secret)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(secret),Buffer.from(supplied)))return Response.json({error:'UNAUTHORIZED'},{status:401});
 const mode=process.env.ROAD_CLOSURE_ALERTS_MODE;
 if(mode!=='observe'&&mode!=='live'&&mode!=='pilot')return Response.json({mode:'off',attempted:0});
 const pilot=trafficPilot();
 if(pilot&&!pilot.configured)return Response.json({mode,pilot,reason:'PILOT_NOT_CONFIGURED',attempted:0});
 if(!await autocabIntegrationEnabled())return Response.json({mode,reason:'AUTOCAB_DISABLED',attempted:0});
 let client,locked=false;
 try{
  client=await database().connect();
  locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('nac:road-closure-alert-worker')) AS locked")).rows[0].locked;
  if(!locked)return Response.json({mode,reason:'WORKER_BUSY',attempted:0});
  await client.query("SET statement_timeout='8s'");
  const plan=await loadAlertPlan(client);
  if(mode==='observe')return Response.json({mode,activeClosures:plan.activeClosures,activeRoadworks:plan.activeRoadworks,activeRestrictions:plan.activeRestrictions,activeEvents:plan.activeEvents,trackedDrivers:plan.trackedDrivers,candidates:plan.candidates.length,attempted:0});
  const connection=await driverMessageConnection();
  if(!connection)return Response.json({mode,reason:'DRIVER_MESSAGE_ENDPOINT_MISSING',attempted:0});
  const candidates=pilotCandidates(plan.candidates,pilot);
  const day=candidates[0]?.day;
  const previous=day?(await client.query('SELECT driver_id,closure_key FROM street_manager_driver_alerts WHERE alert_day=$1',[day])).rows:[];
  const seen=new Set(previous.map(row=>JSON.stringify([row.driver_id,row.closure_key])));
  const cooling=new Set((await client.query("SELECT driver_id FROM street_manager_driver_alert_clock WHERE last_attempt_at>now()-interval '120 seconds'")).rows.map(row=>row.driver_id));
  let attempted=0,accepted=0,rejected=0,unknown=0,suppressed=0;
  for(const candidate of candidates){
   if(attempted>=3)break;
   if(cooling.has(candidate.driverId)||seen.has(JSON.stringify([candidate.driverId,candidate.closureKey])))continue;
   // Re-read time, road status, shift/driver identity and the latest GPS just
   // before reserving each send. Observation never creates delivery claims.
   const fresh=(await loadAlertPlan(client)).candidates.find(c=>c.driverId===candidate.driverId&&c.vehicleId===candidate.vehicleId&&c.closureKey===candidate.closureKey);
   if(!fresh)continue;
   const outgoing=pilot?{...fresh,message:'[TRAFFIC TEST] '+fresh.message}:fresh;
   const id=await claimDriverAlert(client,outgoing);if(!id)continue;
   attempted++;cooling.add(fresh.driverId);
   let result:{status:string;httpStatus:number|null;reason:string};
   try{result=await sendDriverClosureMessage(connection,outgoing.vehicleId,outgoing.message,outgoing.driverId)}catch{result={status:'SUPPRESSED',httpStatus:null,reason:'PRE_SEND_CHECK_FAILED'}}
   await client.query('UPDATE street_manager_driver_alerts SET status=$2,http_status=$3,outcome_code=$4,completed_at=now() WHERE id=$1',[id,result.status,result.httpStatus,result.reason]);
   if(result.status==='ACCEPTED')accepted++;else if(result.status==='REJECTED')rejected++;else if(result.status==='SUPPRESSED')suppressed++;else unknown++;
  }
  return Response.json({mode,activeClosures:plan.activeClosures,activeRoadworks:plan.activeRoadworks,activeRestrictions:plan.activeRestrictions,activeEvents:plan.activeEvents,trackedDrivers:plan.trackedDrivers,pilot,candidates:candidates.length,attempted,accepted,rejected,unknown,suppressed});
 }catch{return Response.json({error:'DRIVER_ALERT_WORKER_UNAVAILABLE'},{status:503})}
 finally{if(client){if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('nac:road-closure-alert-worker'))").catch(()=>{});await client.query('RESET statement_timeout').catch(()=>{});client.release()}}
}
