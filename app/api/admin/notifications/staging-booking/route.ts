import {isAdmin,sameOrigin} from '@/lib/security';
import {fullStageGuard} from '@/lib/notifications/full/guard';
import {signedHeaders,boundedBody} from '@/lib/whatsapp-service-auth';
import {database} from '@/lib/database';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function POST(request:Request){
 if(!await isAdmin()||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403});
 try{fullStageGuard();const input=JSON.parse(await boundedBody(request));if(Object.keys(input).some(k=>!['event','scenario'].includes(k)))throw Error();
 const invoke=async(path:string,payload:unknown)=>{const body=JSON.stringify(payload);const r=await fetch(new URL(path,process.env.APP_ORIGIN),{method:'POST',headers:{'Content-Type':'application/json',...signedHeaders('POST',path,body,process.env.WHATSAPP_NAC_KEY_ID||'',process.env.WHATSAPP_NAC_SECRET||'')},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('STAGE_FLOW_UNAVAILABLE');return r.json() as Promise<Record<string,unknown>>};
 const seeded=await invoke('/api/internal/notifications/v2/staging-control',{action:'seed',event:input.event,scenario:input.scenario});
 const result=await invoke('/api/internal/notifications/v2/booking-event',Object.fromEntries(['booking_id','rule_id','occurred_at','revision'].map(k=>[k,seeded[k]])));
 const saved=(await database().query('SELECT decision FROM notification_decisions WHERE booking_id=$1 ORDER BY id DESC LIMIT 1',[seeded.booking_id])).rows[0]?.decision;
 return Response.json({booking_id:seeded.booking_id,decision:saved,gateway_result:result,transport:'SIMULATED'},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Staging booking flow unavailable. No real message was sent.'},{status:503})}
}
