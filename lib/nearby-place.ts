import {readMapConfiguration} from './map-settings';
import {nearestMapTilerPlace,reverseMapTilerPlaces} from './maptiler-geocoding';
type JsonRecord=Record<string,unknown>;
export type NearbyPlace={name:string;type:string;latitude:number;longitude:number;distanceMetres:number};

const excluded=new Set(['parking','parking_entrance','bicycle_parking','bench','waste_basket','recycling','toilets','post_box','telephone','drinking_water']);
const excludedKeys=new Set(['highway','place','boundary','landuse','waterway','postcode']);
function record(value:unknown):JsonRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{}}
function point(item:JsonRecord){const center=record(item.center),latitude=Number(item.lat??center.lat),longitude=Number(item.lon??center.lon);return Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude,longitude}:null}
function radians(value:number){return value*Math.PI/180}
export function distanceMetres(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){const radius=6371000,dLat=radians(b.latitude-a.latitude),dLon=radians(b.longitude-a.longitude),x=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLon/2)**2;return 2*radius*Math.asin(Math.sqrt(x))}
export function inferredPlaceName(label:string){const first=label.split(',')[0]?.trim()||'';if(first.length<3||/^\d/.test(first)||/\b(?:road|street|lane|avenue|drive|close|way|court|crescent|square|parade|terrace|highway)\.?$/i.test(first))return null;return first}

function geometry(item:JsonRecord){return Array.isArray(item.geometry)&&item.geometry.length<=2000?item.geometry.map(value=>{const p=record(value);return{latitude:Number(p.lat),longitude:Number(p.lon)}}).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180):[]}
function footprintDistance(latitude:number,longitude:number,points:{latitude:number;longitude:number}[]){
 if(!points.length)return Infinity;if(points.length===1)return distanceMetres({latitude,longitude},points[0]);let inside=false,best=Infinity;
 const closed=points.length>=4&&points[0].latitude===points.at(-1)!.latitude&&points[0].longitude===points.at(-1)!.longitude;
 const scale=111195,cos=Math.cos(radians(latitude)),xy=points.map(p=>({x:(p.longitude-longitude)*scale*cos,y:(p.latitude-latitude)*scale}));
 for(let i=1;i<xy.length;i++){const j=i-1;
  const a=xy[j],b=xy[i];if((a.y>0)!==(b.y>0)&&0<(b.x-a.x)*(-a.y)/(b.y-a.y)+a.x)inside=!inside;
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(a.x+t*dx,a.y+t*dy));
 }
 return closed&&inside?0:best;
}
export function nearbyPlaceCandidates(payload:unknown,latitude:number,longitude:number,maxDistance=60):NearbyPlace[]{
 const root=record(payload),elements=Array.isArray(root.elements)?root.elements.slice(0,100):[],features=Array.isArray(root.features)?root.features.slice(0,100):[];
 const reverse=typeof root.name==='string'?{tags:root,location:{latitude:Number(root.lat),longitude:Number(root.lon)},key:String(root.category||''),points:[]}:null;
 const candidates=[...elements.map(value=>{const item=record(value),tags=record(item.tags),points=geometry(item),center=points.length?{latitude:points.reduce((s,p)=>s+p.latitude,0)/points.length,longitude:points.reduce((s,p)=>s+p.longitude,0)/points.length}:null;return{tags,location:point(item)||center,key:String(tags.amenity?'amenity':tags.tourism?'tourism':tags.shop?'shop':tags.leisure?'leisure':tags.office?'office':tags.healthcare?'healthcare':tags.craft?'craft':tags.building?'building':tags.industrial?'industrial':tags.highway?'highway':tags.landuse?'landuse':tags.place?'place':''),points}}),...features.map(value=>{const feature=record(value),tags=record(feature.properties),coordinates=record(feature.geometry).coordinates,location=Array.isArray(coordinates)&&coordinates.length>=2?{latitude:Number(coordinates[1]),longitude:Number(coordinates[0])}:null;return{tags,location,key:String(tags.osm_key||''),points:[]}}),...(reverse?[reverse]:[])];
 return candidates.flatMap(({tags,location,key,points})=>{const label=tags.name||tags.brand||tags.operator,name=typeof label==='string'?label.trim().slice(0,120):'',type=String(tags.amenity||tags.tourism||tags.shop||tags.leisure||tags.office||tags.healthcare||tags.craft||tags.industrial||tags.osm_value||tags.building||'place');if(!name||!location||!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude)||excludedKeys.has(key)||excluded.has(type))return[];const distance=points.length?footprintDistance(latitude,longitude,points):distanceMetres({latitude,longitude},location);return distance<=maxDistance?[{name,type,...location,distanceMetres:Math.round(distance)}]:[]}).sort((a,b)=>a.distanceMetres-b.distanceMetres||a.name.localeCompare(b.name));
}
export function closestNearbyPlace(payload:unknown,latitude:number,longitude:number,maxDistance=60){return nearbyPlaceCandidates(payload,latitude,longitude,maxDistance)[0]||null}
async function nearbyJson(response:Response){const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_NEARBY_RESPONSE');const parts:Uint8Array[]=[];let bytes=0;for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>262144){await reader.cancel();throw Error('NEARBY_RESPONSE_TOO_LARGE');}parts.push(r.value);}return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;}
export async function nearbyNamedPlace(latitude:number,longitude:number,maxDistance?:number){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
 try{
  const {settings,apiKey}=await readMapConfiguration(),radius=maxDistance===undefined?settings.nearbyPlaceRadiusMetres||60:Math.max(1,Math.min(500,maxDistance));
  const tasks:Promise<NearbyPlace[]>[]=[];
  if(settings.searchProvider==='maptiler'&&apiKey)tasks.push(reverseMapTilerPlaces(latitude,longitude,apiKey,settings,controller.signal).then(features=>features.flatMap(feature=>{const p=nearestMapTilerPlace([feature],latitude,longitude,radius);return p?[p]:[]})));
  const headers={Accept:'application/json','User-Agent':'NeedACabPlus/1.0 (webapp.needacabplus.app)'};
  const urls=[`https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&limit=10`,`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1`];
  for(const url of urls)tasks.push(fetch(url,{headers,signal:controller.signal,cache:'no-store'}).then(async r=>r.ok?nearbyPlaceCandidates(await nearbyJson(r),latitude,longitude,radius):[]));
  const scan=Math.min(500,Math.max(250,radius+100)),around=`around:${scan},${latitude},${longitude}`,query=`[out:json][timeout:3];(nw(${around})[name][~"^(amenity|tourism|shop|leisure|office|healthcare|craft|building|industrial)$"~"."];nw(${around})[brand];nw(${around})[operator][building=warehouse];);out body geom 30;`;
  tasks.push(fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:controller.signal,cache:'no-store'}).then(async r=>r.ok?nearbyPlaceCandidates(await nearbyJson(r),latitude,longitude,radius):[]));
  const results=await Promise.allSettled(tasks),places=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).sort((a,b)=>a.distanceMetres-b.distanceMetres||a.name.localeCompare(b.name)),seen=new Set<string>(),distinct=places.filter(p=>{const key=p.name.toLowerCase();if(seen.has(key))return false;seen.add(key);return true}).slice(0,5);
  return distinct[0]?{...distinct[0],alternatives:distinct}:null;
 }catch{return null}finally{clearTimeout(timer)}
}
