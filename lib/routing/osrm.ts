import {z} from 'zod';
import type {RouteCandidate,RouteProvider} from './closure-aware';
export function osrmProvider(base:string,fetcher:typeof fetch=fetch):RouteProvider{
 const root=new URL(base);if(!['http:','https:'].includes(root.protocol)||root.username||root.password)throw Error('Invalid routing service configuration.');
 return async(points,signal)=>{
  const url=new URL(root);url.pathname=root.pathname.replace(/\/$/,'')+'/route/v1/driving/'+points.map(p=>`${p.longitude},${p.latitude}`).join(';');
  url.search=new URLSearchParams({overview:'full',geometries:'geojson',alternatives:'3',steps:'false',continue_straight:'true'}).toString();
  const response=await fetcher(url,{cache:'no-store',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('Routing service unavailable.');
  const reader=response.body?.getReader();if(!reader)throw Error('Empty routing response.');const chunks:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4000000){await reader.cancel();throw Error('Routing response too large.');}chunks.push(part.value);}
  const text=Buffer.concat(chunks).toString('utf8');
  const body=JSON.parse(text) as {code?:string;routes?:{geometry?:{coordinates?:unknown};distance?:number;duration?:number}[]};
  if(body.code!=='Ok'||!Array.isArray(body.routes))throw Error('Routing service could not calculate a route.');
  const candidate=z.object({coordinates:z.array(z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)])).min(2).max(30000),distanceMetres:z.number().positive().max(200000),durationSeconds:z.number().positive().max(86400)});
  return body.routes.slice(0,3).flatMap(r=>{const parsed=candidate.safeParse({coordinates:r?.geometry?.coordinates,distanceMetres:r?.distance,durationSeconds:r?.duration});return parsed.success?[parsed.data as RouteCandidate]:[]});
 };
}
