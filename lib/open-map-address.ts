type JsonRecord=Record<string,unknown>;
const cache=new Map<string,{label:string;expires:number}>();
function record(value:unknown):JsonRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{}}
export function openMapAddressLabel(payload:unknown){const root=record(payload),label=typeof root.display_name==='string'?root.display_name.trim():typeof root.name==='string'?root.name.trim():'';return label||null}
export async function reverseOpenMapAddress(latitude:number,longitude:number){
 const key=`${latitude.toFixed(5)},${longitude.toFixed(5)}`,saved=cache.get(key);if(saved&&saved.expires>Date.now())return saved.label;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
 try{
  const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1`;
  const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'NeedACabPlus/1.0 (webapp.needacabplus.app)'},signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw new Error('OpenStreetMap address lookup failed.');const label=openMapAddressLabel(await response.json());if(!label)throw new Error('OpenStreetMap returned no address.');cache.set(key,{label,expires:Date.now()+300000});return label;
 }finally{clearTimeout(timer)}
}
