import {isAdmin} from '@/lib/security';
import {database} from '@/lib/database';
import {loadStreetPreview} from '@/lib/street-manager/preview-data';
import {loadTomtomTraffic,trafficBounds,trafficRefreshSeconds,type TrafficFeed} from '@/lib/traffic/tomtom';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
async function streetFeed():Promise<TrafficFeed>{
 let client;const checkedAt=new Date().toISOString();
 try{
  client=await database().connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='8s'");
  const data=await loadStreetPreview(client);await client.query('COMMIT');
  const council=data.sourceCoverage?.council;const items=data.items.map(item=>item.source==='council'&&council?.stale?{...item,sourceStale:true,warnings:[...item.warnings,'Council publication is stale or could not be refreshed. Excluded from automatic alerts.']}:item);
  return {status:'ok',checkedAt,lastReceived:data.lastReceipt,council,error:data.limited?'Street Manager is showing the latest 1,500 records; more are available in the source.':null,items,total:data.totalObjects,omitted:Math.max(0,data.totalObjects-data.items.length)};
 }catch{await client?.query('ROLLBACK').catch(()=>{});return {status:'unavailable',checkedAt,error:'Street Manager stored records are temporarily unavailable.',items:[],total:0,omitted:0};}
 finally{client?.release()}
}
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Admin access required.'},{status:403,headers});
 const [street,tomtom]=await Promise.all([streetFeed(),loadTomtomTraffic()]);
 return Response.json({checkedAt:new Date().toISOString(),refreshSeconds:trafficRefreshSeconds,bounds:trafficBounds,street,tomtom},{headers});
}
