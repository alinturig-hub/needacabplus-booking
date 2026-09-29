export type BookingCapability={id:number;shortCode:string;name:string;requirement:string};
export function enabledCapabilities(payload:unknown):BookingCapability[]{
 if(!Array.isArray(payload))throw new Error('Autocab returned an invalid capability list.');
 const items=new Map<number,BookingCapability>();
 for(const value of payload){if(!value||typeof value!=='object')continue;const row=value as Record<string,unknown>;
 if(row.enabled!==true||typeof row.id!=='number'||!Number.isSafeInteger(row.id)||row.id<=0||typeof row.name!=='string'||!row.name.trim())continue;
 items.set(row.id,{id:row.id,name:row.name.trim(),shortCode:typeof row.shortCode==='string'?row.shortCode:'',requirement:typeof row.requirement==='string'?row.requirement:''});}
 return [...items.values()].sort((a,b)=>a.shortCode.localeCompare(b.shortCode,undefined,{numeric:true})||a.name.localeCompare(b.name));
}
