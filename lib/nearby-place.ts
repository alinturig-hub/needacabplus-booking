type JsonRecord=Record<string,unknown>;
export type NearbyPlace={name:string;type:string;latitude:number;longitude:number;distanceMetres:number};

const excluded=new Set(['parking','parking_entrance','bicycle_parking','bench','waste_basket','recycling','toilets','post_box','telephone','drinking_water']);
function record(value:unknown):JsonRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{}}
function point(item:JsonRecord){const center=record(item.center),latitude=Number(item.lat??center.lat),longitude=Number(item.lon??center.lon);return Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude,longitude}:null}
function radians(value:number){return value*Math.PI/180}
export function distanceMetres(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){const radius=6371000,dLat=radians(b.latitude-a.latitude),dLon=radians(b.longitude-a.longitude),x=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLon/2)**2;return 2*radius*Math.asin(Math.sqrt(x))}

export function closestNearbyPlace(payload:unknown,latitude:number,longitude:number,maxDistance=60):NearbyPlace|null{
 const elements=Array.isArray(record(payload).elements)?record(payload).elements as unknown[]:[];
 const matches=elements.flatMap(value=>{const item=record(value),tags=record(item.tags),name=typeof tags.name==='string'?tags.name.trim():'',location=point(item),type=String(tags.amenity||tags.tourism||tags.shop||tags.leisure||tags.office||tags.healthcare||tags.craft||tags.building||'place');if(!name||!location||excluded.has(type))return[];const distance=Math.round(distanceMetres({latitude,longitude},location));return distance<=maxDistance?[{name,type,...location,distanceMetres:distance}]:[]});
 return matches.sort((a,b)=>a.distanceMetres-b.distanceMetres||a.name.localeCompare(b.name))[0]||null;
}

export async function nearbyNamedPlace(latitude:number,longitude:number){
 const query=`[out:json][timeout:5];(nwr(around:40,${latitude},${longitude})[name][amenity];nwr(around:40,${latitude},${longitude})[name][tourism];nwr(around:40,${latitude},${longitude})[name][shop];nwr(around:40,${latitude},${longitude})[name][leisure];nwr(around:40,${latitude},${longitude})[name][office];nwr(around:40,${latitude},${longitude})[name][healthcare];nwr(around:40,${latitude},${longitude})[name][craft];nwr(around:40,${latitude},${longitude})[name][building];);out center tags;`,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5500);
 try{const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded','User-Agent':'NeedACabPlus/1.0 (webapp.needacabplus.app)'},body:new URLSearchParams({data:query}),signal:controller.signal,cache:'no-store'});if(!response.ok)return null;return closestNearbyPlace(await response.json(),latitude,longitude)}catch{return null}finally{clearTimeout(timer)}
}
