type JsonRecord=Record<string,unknown>;
export type NearbyPlace={name:string;type:string;latitude:number;longitude:number;distanceMetres:number};

const excluded=new Set(['parking','parking_entrance','bicycle_parking','bench','waste_basket','recycling','toilets','post_box','telephone','drinking_water']);
const excludedKeys=new Set(['highway','place','boundary','landuse','waterway','postcode']);
function record(value:unknown):JsonRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{}}
function point(item:JsonRecord){const center=record(item.center),latitude=Number(item.lat??center.lat),longitude=Number(item.lon??center.lon);return Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude,longitude}:null}
function radians(value:number){return value*Math.PI/180}
export function distanceMetres(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){const radius=6371000,dLat=radians(b.latitude-a.latitude),dLon=radians(b.longitude-a.longitude),x=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLon/2)**2;return 2*radius*Math.asin(Math.sqrt(x))}
export function inferredPlaceName(label:string){const first=label.split(',')[0]?.trim()||'';if(first.length<3||/^\d/.test(first)||/\b(?:road|street|lane|avenue|drive|close|way|court|crescent|square|parade|terrace|highway)\.?$/i.test(first))return null;return first}

export function closestNearbyPlace(payload:unknown,latitude:number,longitude:number,maxDistance=60):NearbyPlace|null{
 const root=record(payload),elements=Array.isArray(root.elements)?root.elements as unknown[]:[],features=Array.isArray(root.features)?root.features as unknown[]:[];
 const reverse=typeof root.name==='string'?{tags:root,location:{latitude:Number(root.lat),longitude:Number(root.lon)},key:String(root.category||'')}:null,candidates=[...elements.map(value=>{const item=record(value),tags=record(item.tags);return{tags,location:point(item),key:String(tags.amenity?'amenity':tags.tourism?'tourism':tags.shop?'shop':tags.leisure?'leisure':tags.office?'office':tags.healthcare?'healthcare':tags.craft?'craft':tags.building?'building':'')}}),...features.map(value=>{const feature=record(value),tags=record(feature.properties),coordinates=record(feature.geometry).coordinates,location=Array.isArray(coordinates)&&coordinates.length>=2?{latitude:Number(coordinates[1]),longitude:Number(coordinates[0])}:null;return{tags,location,key:String(tags.osm_key||'')}}),...(reverse?[reverse]:[])];
 const matches=candidates.flatMap(({tags,location,key})=>{const name=typeof tags.name==='string'?tags.name.trim():'',type=String(tags.amenity||tags.tourism||tags.shop||tags.leisure||tags.office||tags.healthcare||tags.craft||tags.osm_value||tags.building||'place');if(!name||!location||!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude)||excludedKeys.has(key)||excluded.has(type))return[];const distance=Math.round(distanceMetres({latitude,longitude},location));return distance<=maxDistance?[{name,type,...location,distanceMetres:distance}]:[]});
 return matches.sort((a,b)=>a.distanceMetres-b.distanceMetres||a.name.localeCompare(b.name))[0]||null;
}

export async function nearbyNamedPlace(latitude:number,longitude:number){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
 try{const urls=[`https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&limit=10`,`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1`],responses=await Promise.allSettled(urls.map(url=>fetch(url,{headers:{Accept:'application/json','User-Agent':'NeedACabPlus/1.0 (webapp.needacabplus.app)'},signal:controller.signal,cache:'no-store'})));const places=(await Promise.all(responses.flatMap(result=>result.status==='fulfilled'&&result.value.ok?[result.value.json().then(payload=>closestNearbyPlace(payload,latitude,longitude)).catch(()=>null)]:[]))).filter((place):place is NearbyPlace=>Boolean(place));return places.sort((a,b)=>a.distanceMetres-b.distanceMetres)[0]||null}catch{return null}finally{clearTimeout(timer)}
}
