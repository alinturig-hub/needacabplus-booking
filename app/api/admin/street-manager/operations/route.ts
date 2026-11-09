import {isAdmin} from '@/lib/security';
import {database} from '@/lib/database';
import {loadAlertPlan,alertPolicy} from '@/lib/street-manager/alert-plan';
import {loadStreetPreview} from '@/lib/street-manager/preview-data';
import {streetManagerStatus} from '@/lib/street-manager/status';
import {driverAlertDeliveryStatus} from '@/lib/street-manager/alert-delivery';
import {driverMessageConnection} from '@/lib/street-manager/driver-message';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Forbidden'},{status:403});
 let client;
 try{
  client=await database().connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='8s'");
  const now=Date.now(),roadworks=await loadStreetPreview(client),alerts=await loadAlertPlan(client,now),feed=await streetManagerStatus(client),delivery=await driverAlertDeliveryStatus(client);await client.query('COMMIT');
  let transport='missing';try{transport=await driverMessageConnection()?'configured':'missing'}catch{transport='invalid'}
  return Response.json({checkedAt:new Date(now).toISOString(),mode:process.env.ROAD_CLOSURE_ALERTS_MODE||'off',transport,policy:alertPolicy,roadworks,alerts,delivery,feed:{state:feed.state,subscriptions:feed.subscriptions.map(row=>({topic:row.topic,confirmedAt:row.confirmed_at})),topics:feed.topics.map(row=>({topic:row.topic,total:Number(row.total),lastReceived:row.last_received}))}},{headers:{'Cache-Control':'private, no-store'}});
 }catch{await client?.query('ROLLBACK').catch(()=>{});return Response.json({error:'Roadworks operations are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}})}finally{client?.release()}
}
