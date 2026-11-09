import type {Geometry} from 'geojson';
import {councilRoadKey,councilUserAgent,type CouncilNotice} from './council';
import {boundedText} from './sns';
export type CouncilLocation={geometry:Geometry;quality:'approximate';basis:'junction'|'street';source:'OpenStreetMap';checkedAt:string};
type Way={type:string;id:number;nodes?:number[];tags?:{name?:string};geometry?:{lat:number;lon:number}[]};
const roadName=(value:string)=>value.replace(/\([^)]*\)/g,'').trim();
export function councilJunctionNames(traffic:string){
 const match=traffic.match(/junction(?:s)?\s+(?:with|of)\s+(.+?)(?:,|;|\(|$)/i);return match?match[1].split(/\s+and\s+/i).map(roadName).filter(n=>n.length>=3&&n.length<100):[];
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
  for(const name of councilJunctionNames(notice.traffic)){
   const cross=roads.get(councilRoadKey(name))??[],shared=new Map<number,{lat:number;lon:number}>();
   for(const way of cross)for(const id of way.nodes??[]){const p=points.get(id);if(p)shared.set(id,p)}
   const candidates=[...shared.values()];if(candidates.length){const first=candidates[0];if(candidates.every(p=>Math.hypot((p.lon-first.lon)*71000,(p.lat-first.lat)*111195)<100)){position=first;basis='junction';break}}
  }
  if(!position){
   const candidates=[...points.values()];if(!candidates.length)continue;
   const latitudes=candidates.map(p=>p.lat),longitudes=candidates.map(p=>p.lon);
   if(Math.max(...latitudes)-Math.min(...latitudes)>.025||Math.max(...longitudes)-Math.min(...longitudes)>.04)continue;
   const center={lat:(Math.min(...latitudes)+Math.max(...latitudes))/2,lon:(Math.min(...longitudes)+Math.max(...longitudes))/2};
   position=candidates.sort((a,b)=>Math.hypot((a.lon-center.lon)*.64,a.lat-center.lat)-Math.hypot((b.lon-center.lon)*.64,b.lat-center.lat))[0];
  }
  if(position)result[notice.id]={geometry:{type:'Point',coordinates:[position.lon,position.lat]},quality:'approximate',basis,source:'OpenStreetMap',checkedAt:now};
 }
 return result;
}
export async function fetchCouncilLocations(notices:CouncilNotice[]):Promise<Record<string,CouncilLocation>>{
 if(!notices.length)return {};
 const names=[...new Set(notices.flatMap(n=>[...n.street.split('/').map(roadName),...councilJunctionNames(n.traffic)]))].filter(n=>n.length>=3&&n.length<=120).slice(0,160);
 const pattern='^('+names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$';
 const query='[out:json][timeout:20];way["highway"]["name"~'+JSON.stringify(pattern)+',i](50.30,-4.26,50.51,-3.93);out geom;';
 try{
  const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'User-Agent':councilUserAgent,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(25000),redirect:'error',cache:'no-store'});
  if(!response.ok)return {};
  return locateCouncilNotices(notices,JSON.parse(await boundedText(response,5000000)));
 }catch{return {}}
}
