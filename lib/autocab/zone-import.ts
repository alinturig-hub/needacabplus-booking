import {mapZoneInputSchema} from '@/lib/map-zone-schema';
export type AutocabZoneRecord={externalId:string;name:string;active:boolean;mdtZoneId:number|null;descriptor:string|null;rawPayload:Record<string,unknown>;lastSyncedAt?:string};
export function prepareAutocabZone(record:AutocabZoneRecord){
 const raw=record.rawPayload;
 if(!Array.isArray(raw.boundary))throw new Error('Autocab boundary is missing.');
 const points=raw.boundary.map((point:unknown)=>{const p=point as {longitude:number;latitude:number};return [p.longitude,p.latitude] as [number,number]});
 // Repeated consecutive vertices have zero length; remove them without changing the boundary.
 const ring=points.filter((p,i)=>i===0||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);
 // Only close the source ring; never simplify, repair or invent a boundary.
 if(ring.length&&JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))ring.push([...ring[0]]);
 const colour=typeof raw.listColour==='string'&&/^#[0-9a-f]{6}$/i.test(raw.listColour)?raw.listColour:'#5486b8';
 return mapZoneInputSchema.parse({name:record.name,colour,purpose:raw.zoneType==='Normal'?'plot':'system',enabled:record.active,geometry:{type:'Polygon',coordinates:[ring]}});
}
