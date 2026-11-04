type JsonRecord=Record<string,unknown>;
const cache=new Map<string,{label:string;expires:number}>();
function record(value:unknown):JsonRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{}}
function text(value:unknown){return typeof value==='string'?value.trim():''}
export function openMapAddressLabel(payload:unknown){const root=record(payload),label=text(root.display_name)||text(root.name);return label||null}
export function photonAddressLabel(payload:unknown){
 const root=record(payload),features=Array.isArray(root.features)?root.features:[];
 for(const feature of features){
  const p=record(record(feature).properties),street=[text(p.housenumber),text(p.street)].filter(Boolean).join(' '),city=text(p.city)||text(p.town)||text(p.village),name=text(p.name);
  // A city-only result cannot identify a pickup street or venue.
  const specific=street||(name&&name.toLowerCase()!==city.toLowerCase()?name:'');if(!specific)continue;
  return [specific,text(p.postcode),city].filter((part,index,parts)=>part&&parts.findIndex(value=>value.toLowerCase()===part.toLowerCase())===index).join(', ');
 }
 return null;
}
export async function reverseOpenMapAddress(latitude:number,longitude:number){
 const key=`${latitude.toFixed(5)},${longitude.toFixed(5)}`,saved=cache.get(key);if(saved&&saved.expires>Date.now())return saved.label;
 const providers=[{url:`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1`,label:openMapAddressLabel},{url:`https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&limit=1`,label:photonAddressLabel}];
 for(const provider of providers){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
  try{
   const response=await fetch(provider.url,{headers:{Accept:'application/json','User-Agent':'NeedACabPlus/1.0 (webapp.needacabplus.app)'},signal:controller.signal,cache:'no-store'});
   if(!response.ok)continue;const label=provider.label(await response.json());if(!label)continue;
   cache.set(key,{label,expires:Date.now()+300000});return label;
  }catch{/* Try the next configured public address service; never invent a street. */}finally{clearTimeout(timer)}
 }
 throw new Error('No pickup street or venue could be found at this location.');
}
