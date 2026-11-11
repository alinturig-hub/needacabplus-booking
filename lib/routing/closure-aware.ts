import type {Geometry} from 'geojson';
import {distanceToClosure} from '../street-manager/closure-alerts';
import {geometryBounds} from '../street-manager/geometry';
export type RoutePoint={latitude:number;longitude:number};
export type RouteCandidate={coordinates:number[][];distanceMetres:number;durationSeconds:number};
export type RouteClosure={id:string;street:string;geometry:Geometry;startsAt:number;endsAt:number};
export type RouteProvider=(points:RoutePoint[],signal?:AbortSignal)=>Promise<RouteCandidate[]>;
const buffer=25,step=10;
const metres=(a:number[],b:number[])=>Math.hypot((a[0]-b[0])*111195*Math.cos((a[1]+b[1])/2*Math.PI/180),(a[1]-b[1])*111195);
export function validateCandidate(route:RouteCandidate,points:RoutePoint[]){
 if(!Number.isFinite(route.distanceMetres)||route.distanceMetres<=0||route.distanceMetres>200000||!Number.isFinite(route.durationSeconds)||route.durationSeconds<=0||route.durationSeconds>86400||route.coordinates.length<2||route.coordinates.length>30000||route.coordinates.some(p=>p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90))return false;
 const first=points[0],last=points.at(-1)!;
 // Reject a provider silently snapping a mandatory stop onto a different road.
 return metres(route.coordinates[0],[first.longitude,first.latitude])<=40&&metres(route.coordinates.at(-1)!,[last.longitude,last.latitude])<=40;
}
export function routeConflicts(route:RouteCandidate,closures:RouteClosure[],departAt:number){
 const result=new Set<string>();let travelled=0;const total=route.coordinates.slice(1).reduce((sum,p,i)=>sum+metres(route.coordinates[i],p),0);
 if(!Number.isFinite(total)||total<=0||total>200000)throw Error('Invalid route geometry.');
 for(let i=1;i<route.coordinates.length;i++){
  const a=route.coordinates[i-1],b=route.coordinates[i],length=metres(a,b),count=Math.max(1,Math.ceil(length/step));
  for(const closure of closures){
   const enter=departAt+travelled/total*route.durationSeconds*1000,exit=departAt+(travelled+length)/total*route.durationSeconds*1000;
   // Conservative on clocks: check the entire segment's travel interval.
   if(enter>=closure.endsAt||exit<closure.startsAt||result.has(closure.id))continue;
   const bounds=geometryBounds(closure.geometry),margin=0.0005;
   if(Math.max(a[0],b[0])<bounds[0]-margin||Math.min(a[0],b[0])>bounds[2]+margin||Math.max(a[1],b[1])<bounds[1]-margin||Math.min(a[1],b[1])>bounds[3]+margin)continue;
   for(let n=0;n<=count;n++){
    const t=n/count,lng=a[0]+(b[0]-a[0])*t,lat=a[1]+(b[1]-a[1])*t;
    // Half a sampling step is included, so a thin crossing cannot fall in a gap.
    if(distanceToClosure(lat,lng,closure.geometry)<=buffer+step/2){result.add(closure.id);break;}
   }
  }
  travelled+=length;
 }
 return [...result];
}
function detours(closure:RouteClosure):RoutePoint[]{
 const [w,s,e,n]=geometryBounds(closure.geometry),lat=(s+n)/2,lng=(w+e)/2;
 // Propose points outside the reported extent. The returned road route must
 // still pass validation; these points are never treated as proof of avoidance.
 return [150,400].flatMap(radius=>{const dy=radius/111195,dx=dy/Math.cos(lat*Math.PI/180);return [{latitude:n+dy,longitude:lng},{latitude:s-dy,longitude:lng},{latitude:lat,longitude:w-dx},{latitude:lat,longitude:e+dx}]});
}
export class NoVerifiedRoute extends Error{constructor(public reason:'no_verified_route'|'budget_exhausted'){super('No route avoiding the reported closures could be verified.');}}
export async function closureAwareRoute(points:RoutePoint[],closures:RouteClosure[],departAt:number,provider:RouteProvider,signal?:AbortSignal){
 if(points.length<2||points.length>5||!Number.isFinite(departAt)||points.some(p=>!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||p.latitude<50.30||p.latitude>50.51||p.longitude< -4.26||p.longitude> -3.93))throw Error('Select 2 to 5 stops in the Plymouth pilot area.');
 if(closures.length>500)throw Error('Too many closures to verify safely.');
 let requests=0,elapsed=0;const legs:RouteCandidate[]=[],avoided=new Set<string>();
 for(let leg=1;leg<points.length;leg++){
  const origin=points[leg-1],destination=points[leg],queue:RoutePoint[][]=[[origin,destination]],seen=new Set<string>();let best:RouteCandidate|undefined,attempts=0;
  while(queue.length&&attempts<9&&requests<24){
   signal?.throwIfAborted();const via=queue.shift()!,key=JSON.stringify(via);if(seen.has(key))continue;seen.add(key);requests++;attempts++;
   // A failed detour does not discard already verified alternatives.
   let routes:RouteCandidate[];try{routes=await provider(via,signal)}catch(error){if(signal?.aborted)throw error;if(attempts===1)throw error;continue;}
   const blocked=new Set<string>();
   for(const route of routes.slice(0,3)){
    if(!validateCandidate(route,[origin,destination]))continue;
    const conflicts=routeConflicts(route,closures,departAt+elapsed*1000);
    if(!conflicts.length){if(!best||route.durationSeconds<best.durationSeconds)best=route;}else conflicts.forEach(id=>{blocked.add(id);avoided.add(id)});
   }
   if(best)break;
   // Branch on the first conflict only; every proposal is checked against ALL
   // closures, including ones encountered for the first time on the detour.
   const closure=closures.find(c=>blocked.has(c.id));
   if(closure&&via.length<5)for(const point of detours(closure))queue.push([...via.slice(0,-1),point,destination]);
  }
  if(!best)throw new NoVerifiedRoute(requests>=24||attempts>=9?'budget_exhausted':'no_verified_route');
  legs.push(best);elapsed+=best.durationSeconds;
 }
 const route={coordinates:legs.flatMap((leg,i)=>i?leg.coordinates.slice(1):leg.coordinates),distanceMetres:legs.reduce((sum,l)=>sum+l.distanceMetres,0),durationSeconds:elapsed};
 // Final full-journey recheck uses the same per-leg clocks (not a redistributed
 // whole-journey speed, which could alter restriction eligibility).
 let offset=0;for(const leg of legs){if(routeConflicts(leg,closures,departAt+offset*1000).length)throw new NoVerifiedRoute('no_verified_route');offset+=leg.durationSeconds;}
 return {...route,requests,avoidedClosureIds:[...avoided],basis:'fastest_verified_candidate' as const,liveTrafficSpeeds:false};
}
