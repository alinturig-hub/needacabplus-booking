import {z} from 'zod';
import {isAdmin,sameOrigin} from '@/lib/security';
import {database} from '@/lib/database';
import {storedClosures} from '@/lib/routing/stored-closures';
import {closureAwareRoute,NoVerifiedRoute} from '@/lib/routing/closure-aware';
import {osrmProvider} from '@/lib/routing/osrm';
const point=z.object({latitude:z.number().min(50.30).max(50.51),longitude:z.number().min(-4.26).max(-3.93)}).strict();
const input=z.object({points:z.array(point).min(2).max(5)}).strict();
const headers={'Cache-Control':'private, no-store'};
let running=0;
export async function POST(request:Request){
 if(!await isAdmin())return Response.json({error:'Admin access required.'},{status:403,headers});
 if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403,headers});
 const base=process.env.TRAFFIC_ROUTING_OSRM_URL;
 if(!base)return Response.json({error:'Configure TRAFFIC_ROUTING_OSRM_URL for an OSRM service approved for production use. The public demo is not used automatically.'},{status:503,headers});
 if(running>=2)return Response.json({error:'Route preview is busy. Try again shortly.'},{status:429,headers:{...headers,'Retry-After':'30'}});
 if(Number(request.headers.get('content-length'))>5000)return Response.json({error:'Request too large.'},{status:413,headers});
 let body:z.infer<typeof input>;try{const raw=await request.text();if(raw.length>5000)throw Error();body=input.parse(JSON.parse(raw));}catch{return Response.json({error:'Select 2 to 5 valid Plymouth stops.'},{status:400,headers});}
 running++;let client;const now=Date.now();
 try{
  client=await database().connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='5s'");
  const source=await storedClosures(client,now);await client.query('COMMIT');client.release();client=undefined;
  const route=await closureAwareRoute(body.points,source.closures,now,osrmProvider(base),AbortSignal.any([request.signal,AbortSignal.timeout(20000)]));
  return Response.json({...route,checkedAt:new Date(now).toISOString(),previewOnly:true,quotePriceChanged:false,coverage:source.coverage,limitations:source.limitations,knownClosures:source.closures.length},{headers});
 }catch(error){await client?.query('ROLLBACK').catch(()=>{});return Response.json({error:error instanceof NoVerifiedRoute?error.message:'Route could not be verified. No unchecked fallback was returned.'},{status:error instanceof NoVerifiedRoute?422:503,headers});}
 finally{client?.release();running--;}
}
