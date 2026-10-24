import {z} from 'zod';
import {database} from '@/lib/database';
import {currentDriver,trainingPickup,trainingDestination,previewDriver} from '@/lib/driver-app';
import {authLimit,AuthError} from '@/lib/customer-verification';
import {sameOrigin,unavailable} from '@/lib/security';
import {maneuverText,type NavStep} from '@/lib/driver-navigation';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 try{const body=z.object({preview:z.boolean().default(false),jobId:z.string().uuid().optional(),phase:z.enum(['pickup','destination'])}).strict().parse(await request.json());let from=previewDriver,to=body.phase==='pickup'?trainingPickup:trainingDestination,illustrative=true;
 if(body.preview){const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0];await authLimit('driver-preview-route:'+ip,30,60);if(body.phase==='destination')from=trainingPickup}else{
 const driver=await currentDriver();if(!driver)return Response.json({error:'Driver sign-in required.'},{status:401});await authLimit('driver-route:'+driver.id,30,60);const job=(await database().query('SELECT pickup,destination,training FROM driver_app_jobs WHERE id=$1 AND account_id=$2',[body.jobId,driver.id])).rows[0];if(!job)return Response.json({error:'Job not found.'},{status:404});to=body.phase==='pickup'?job.pickup:job.destination;
 const fresh=driver.gps_at&&Date.now()-new Date(driver.gps_at).getTime()<30000&&driver.accuracy<=100;
 if(fresh){from={latitude:Number(driver.latitude),longitude:Number(driver.longitude)};illustrative=false}else if(job.training)from=body.phase==='pickup'?previewDriver:job.pickup;else return Response.json({error:'A fresh GPS fix is required.'},{status:409});
 }
 const root=process.env.DRIVER_ROUTING_URL||'https://router.project-osrm.org';const url=new URL(`/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`,root);if(url.protocol!=='https:')throw Error('Routing requires HTTPS');url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'true'}).toString();
 const response=await fetch(url,{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)return Response.json({error:'Routing service unavailable. Retry when connected.'},{status:503});
 type Step={name?:string;distance:number;maneuver:{type:string;modifier?:string;location:[number,number]}};
 const data=await response.json() as {routes?:{geometry:{coordinates:[number,number][]};distance:number;duration:number;legs:{steps:Step[]}[]}[]};const route=data.routes?.[0];if(!route?.geometry?.coordinates?.length)return Response.json({error:'No driving route found.'},{status:422});let total=0;const steps:NavStep[]=[];for(const leg of route.legs)for(const step of leg.steps){steps.push({instruction:maneuverText(step.maneuver.type,step.maneuver.modifier,step.name),distanceFromStart:total,location:step.maneuver.location});total+=step.distance}
 return Response.json({coordinates:route.geometry.coordinates,distance:route.distance,duration:route.duration,steps,illustrative,trafficAware:false},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof AuthError)return Response.json({error:e.message},{status:e.status});if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Invalid route request.'},{status:400});return unavailable(e)}
}
