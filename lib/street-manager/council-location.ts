import type {Geometry} from 'geojson';
import {councilRoadKey,councilUserAgent,type CouncilNotice} from './council';
import {boundedText} from './sns';
export type CouncilLocation={geometry:Geometry;quality:'approximate'|'verified';basis:'junction'|'street'|'segment';source:'OpenStreetMap';checkedAt:string};
type Way={type:string;id:number;nodes?:number[];tags?:{name?:string};geometry?:{lat:number;lon:number}[]};
const roadName=(value:string)=>value.replace(/\([^)]*\)/g,'').trim();
export function councilJunctionNames(traffic:string){
 const match=traffic.match(/junction(?:s)?\s+(?:with|of)\s+(.+?)(?:,|;|\(|$)/i);return match?match[1].split(/\s+and\s+/i).map(roadName).filter(n=>n.length>=3&&n.length<100):[];
}
export function councilExtentNames(traffic:string){
 const m=traffic.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?:,|;|\(|$)/i)||traffic.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:,|;|\(|$)/i);
 if(!m)return [];const names=m.slice(1,3).map(roadName);
 return names.every(n=>n.length>=3&&n.length<=100&&!/^(?:number|no\.?|\d)|\b(?:am|pm|hrs?|hours?)\b/i.test(n))?names:[];
}
export function locateCouncilNotices(notices:CouncilNotice[],payload:unknown,now=new Date().toISOString()):Record<string,CouncilLocation>{
 const ways=payload&&typeof payload==='object'&&Array.isArray((payload as {elements?:unknown}).elements)?(payload as {elements:Way[]}).elements.slice(0,3000):[];
 const roads=new Map<string,Way[]>();
 for(const way of ways){if(way.type!=='way'||!way.tags?.name||!way.geometry?.length||way.geometry.length>10000||!way.nodes||way.nodes.length!==way.geometry.length)continue;const key=councilRoadKey(way.tags.name),parts=roads.get(key)??[];parts.push(way);roads.set(key,parts)}
 const result:Record<string,CouncilLocation>={};
 const valid=(p:{lat:number;lon:number})=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=50.30&&p.lat<=50.51&&p.lon>=-4.26&&p.lon<=-3.93;
 for(const notice of notices){
  const names=notice.street.split('/').map(roadName);if(names.length!==1)continue;
  const main=roads.get(councilRoadKey(names[0]))??[];if(!main.length)continue;
  const points=new Map<number,{lat:number;lon:number}>();for(const way of main)way.nodes!.forEach((id,i)=>{const p=way.geometry![i];if(valid(p))points.set(id,p)});
  let position:{lat:number;lon:number}|null=null,basis:'junction'|'street'='street';
  const sharedNodes=(name:string)=>{
   const ids=new Set<number>();for(const way of roads.get(councilRoadKey(name))??[])for(const id of way.nodes??[]){if(points.has(id))ids.add(id);}return [...ids];
  };
  const extents=councilExtentNames(notice.traffic);
  if(extents.length===2){
   const a=sharedNodes(extents[0]),b=sharedNodes(extents[1]);
   if(a.length===1&&b.length===1&&a[0]!==b[0]){
    const graph=new Map<number,Set<number>>();for(const way of main)for(let i=1;i<way.nodes!.length;i++){const x=way.nodes![i-1],y=way.nodes![i];if(!points.has(x)||!points.has(y))continue;for(const [u,v] of [[x,y],[y,x]]){const edges=graph.get(u)||new Set<number>();edges.add(v);graph.set(u,edges);}}
    // Require a unique simple main-road path; ambiguous loops/branches stay approximate.
    const queue=[a[0]],previous=new Map<number,number|null>([[a[0],null]]);let ambiguous=false;
    for(let i=0;i<queue.length;i++){const at=queue[i];for(const next of graph.get(at)||[]){if(next===previous.get(at))continue;if(previous.has(next)){ambiguous=true;continue;}previous.set(next,at);queue.push(next);}}
    if(previous.has(b[0])&&!ambiguous){const ids:number[]=[];let at:number|null=b[0];while(at!==null){ids.push(at);at=previous.get(at)??null;}const coordinates=ids.reverse().map(id=>{const p=points.get(id)!;return [p.lon,p.lat];});if(coordinates.length>=2){result[notice.id]={geometry:{type:'LineString',coordinates},quality:'verified',basis:'segment',source:'OpenStreetMap',checkedAt:now};continue;}}
   }
  }
  for(const name of councilJunctionNames(notice.traffic)){
   const cross=roads.get(councilRoadKey(name))??[],shared=new Map<number,{lat:number;lon:number}>();
   for(const way of cross)for(const id of way.nodes??[]){const p=points.get(id);if(p)shared.set(id,p)}
   const candidates=[...shared.values()];if(candidates.length){const first=candidates[0];if(candidates.every(p=>Math.hypot((p.lon-first.lon)*71000,(p.lat-first.lat)*111195)<100)){position=first;basis='junction';if(candidates.length===1&&councilJunctionNames(notice.traffic).length===1)result[notice.id]={geometry:{type:'Point',coordinates:[first.lon,first.lat]},quality:'verified',basis:'junction',source:'OpenStreetMap',checkedAt:now};break}}
  }
  if(!position){
   const candidates=[...points.values()];if(!candidates.length)continue;
   const latitudes=candidates.map(p=>p.lat),longitudes=candidates.map(p=>p.lon);
   if(Math.max(...latitudes)-Math.min(...latitudes)>.025||Math.max(...longitudes)-Math.min(...longitudes)>.04)continue;
   const center={lat:(Math.min(...latitudes)+Math.max(...latitudes))/2,lon:(Math.min(...longitudes)+Math.max(...longitudes))/2};
   position=candidates.sort((a,b)=>Math.hypot((a.lon-center.lon)*.64,a.lat-center.lat)-Math.hypot((b.lon-center.lon)*.64,b.lat-center.lat))[0];
  }
  if(position&&!result[notice.id])result[notice.id]={geometry:{type:'Point',coordinates:[position.lon,position.lat]},quality:'approximate',basis,source:'OpenStreetMap',checkedAt:now};
 }
 return result;
}
export async function fetchCouncilLocations(notices:CouncilNotice[]):Promise<Record<string,CouncilLocation>>{
 if(!notices.length)return {};
 const names=[...new Set(notices.flatMap(n=>[...n.street.split('/').map(roadName),...councilJunctionNames(n.traffic),...councilExtentNames(n.traffic)]))].filter(n=>n.length>=3&&n.length<=120).slice(0,240);
 const pattern='^('+names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$';
 const query='[out:json][timeout:20];way["highway"]["name"~'+JSON.stringify(pattern)+',i](50.30,-4.26,50.51,-3.93);out geom;';
 try{
  const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'User-Agent':councilUserAgent,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(25000),redirect:'error',cache:'no-store'});
  if(!response.ok)return {};
  return locateCouncilNotices(notices,JSON.parse(await boundedText(response,5000000)));
 }catch{return {}}
}
