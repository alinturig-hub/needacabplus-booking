import {isAdmin} from '@/lib/security';
import {database} from '@/lib/database';
import {loadAlertPlan,alertPolicy} from '@/lib/street-manager/alert-plan';
import {driverAlertDeliveryStatus} from '@/lib/street-manager/alert-delivery';
import {driverMessageConnection,driverMessageAction} from '@/lib/street-manager/driver-message';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Forbidden'},{status:403});
 let client;
 try{
  client=await database().connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='8s'");
  const plan=await loadAlertPlan(client),delivery=await driverAlertDeliveryStatus(client);await client.query('COMMIT');
  let transport='missing';try{transport=await driverMessageConnection()?'configured':'missing'}catch{transport='invalid'}
  return Response.json({mode:process.env.ROAD_CLOSURE_ALERTS_MODE||'off',readOnly:true,transport,delivery,requiredAction:driverMessageAction,policy:alertPolicy,...plan},{headers:{'Cache-Control':'private, no-store'}});
 }catch{await client?.query('ROLLBACK').catch(()=>{});return Response.json({error:'Driver alert preview unavailable.'},{status:503})}finally{client?.release()}
}
