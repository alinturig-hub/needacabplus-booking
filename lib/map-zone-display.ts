import type {FeatureCollection,Feature,Polygon,MultiPolygon,Point} from 'geojson';
import type {MapZone} from './map-zone-schema';
export type ReferenceZone={id:string;name:string;purpose:'plot';enabled:boolean;geometry:Polygon;source_payload:Record<string,unknown>;reference:true};
export type DisplayZone=MapZone|ReferenceZone;
export function zoneMapFeatures(zones:DisplayZone[],selectedId:string|null){
 const boundaries:Feature<Polygon|MultiPolygon>[]=[],labels:Feature<Point>[]=[];
 for(const zone of zones){
  if(zone.purpose==='system')continue;
  const parts=zone.geometry.type==='MultiPolygon'?zone.geometry.coordinates:[zone.geometry.coordinates];
  const points=parts.flatMap(p=>p[0]);if(!points.length)continue;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const west=Math.min(...xs),east=Math.max(...xs),south=Math.min(...ys),north=Math.max(...ys);
  const raw=zone.source_payload??{},centre=raw.centre as {longitude?:number;latitude?:number}|undefined;
  const position=Number.isFinite(centre?.longitude)&&Number.isFinite(centre?.latitude)?[centre!.longitude!,centre!.latitude!]:[(west+east)/2,(south+north)/2];
  const id=raw.mdtZoneId,code=typeof raw.descriptor==='string'?raw.descriptor.trim():'';
  const reference='reference' in zone&&zone.reference;
  const props={id:zone.id,name:zone.name,label:id!==undefined&&id!==null?`(${id}) ${code||zone.name}`:zone.name,selected:zone.id===selectedId,operating:zone.purpose==='operational',reference,broad:east-west>5||north-south>5};
  boundaries.push({type:'Feature',id:zone.id,properties:props,geometry:zone.geometry});
  if(!props.operating)labels.push({type:'Feature',properties:props,geometry:{type:'Point',coordinates:position}});
 }
 return {boundaries:{type:'FeatureCollection',features:boundaries} as FeatureCollection<Polygon|MultiPolygon>,labels:{type:'FeatureCollection',features:labels} as FeatureCollection<Point>};
}
export function autocabReferenceZone(row:{externalId:string;name:string;rawPayload:Record<string,unknown>}):ReferenceZone|null{
 const raw=row.rawPayload;if(raw.zoneType!=='Normal'||!Array.isArray(raw.boundary))return null;
 const points=raw.boundary.map(p=>[p?.longitude,p?.latitude]);
 if(points.length<3||points.length>1001||points.some(p=>p.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>85))return null;
 if(JSON.stringify(points[0])!==JSON.stringify(points.at(-1)))points.push([...points[0]]);
 return{id:`autocab:${row.externalId}`,name:row.name,purpose:'plot',enabled:true,geometry:{type:'Polygon',coordinates:[points]},source_payload:raw,reference:true};
}
