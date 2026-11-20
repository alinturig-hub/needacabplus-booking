export type PickupPlace={name:string;distanceMetres:number|null};
type PickupChoice={address:string;fullAddress:Record<string,unknown>|null;placeID:string|null;customAddressID:string|number|null};

// A suggestion labels the confirmed GPS point; it never silently relocates it.
export function pickupPlaces(value:unknown):PickupPlace[]{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>();
 return value.flatMap(item=>{
  if(!item||typeof item!=='object')return [];
  const name=typeof item.name==='string'?item.name.trim().replace(/\s+/g,' ').slice(0,120):'';
  const distance=item.distanceMetres;
  if(!/[\p{L}\p{N}]/u.test(name)||typeof distance!=='number'||!Number.isFinite(distance)||distance<0||distance>300)return [];
  return [{name,distanceMetres:Math.round(distance)}];
 }).sort((a,b)=>a.distanceMetres-b.distanceMetres).filter(place=>{
  const key=place.name.toLocaleLowerCase('en-GB');if(seen.has(key))return false;seen.add(key);return true;
 }).slice(0,5);
}

export function pickupWithPlace<T extends PickupChoice>(choice:T,name:string|undefined):T{
 if(!name)return choice;
 const label=choice.address.toLocaleLowerCase('en-GB').startsWith(name.toLocaleLowerCase('en-GB')+',')?choice.address:`${name}, ${choice.address}`;
 return {...choice,address:label.slice(0,250),fullAddress:choice.fullAddress?{...choice.fullAddress,text:label.slice(0,250)}:null};
}
