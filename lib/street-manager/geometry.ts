import proj4 from 'proj4';
import {wktToGeoJSON} from '@terraformer/wkt';
import type {Geometry,Position} from 'geojson';

// EPSG:27700 (OSGB36) -> WGS84 using the standard seven-parameter Helmert
// transform. This is a map preview, not a survey-grade OSTN15 conversion.
const bng='+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.2470,0.8421,-20.4894 +units=m +no_defs';
export function streetGeometry(input:unknown):Geometry|null{
 try{
  if(typeof input==='string'){
   if(input.length>150000)return null;
   const text=input.trim();input=text.startsWith('{')?JSON.parse(text):wktToGeoJSON(text.replace(/^SRID=27700;/i,''));
  }
  let count=0;
  function position(value:unknown):Position{
   if(!Array.isArray(value)||value.length<2||!value.every(n=>typeof n==='number'&&Number.isFinite(n)))throw Error('INVALID_COORDINATE');
   const [east,north]=value;
   if(++count>10000||east<0||east>700000||north<0||north>1300000)throw Error('INVALID_BNG');
   const [lng,lat]=proj4(bng,'EPSG:4326',[east,north]);
   if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng< -9||lng>3||lat<49||lat>61)throw Error('OUTSIDE_GB');
   return [lng,lat];
  }
  function coordinates(value:unknown,depth:number):unknown{
   if(depth===0)return position(value);
   if(!Array.isArray(value)||value.length===0||value.length>10000)throw Error('INVALID_GEOMETRY');
   return value.map(child=>coordinates(child,depth-1));
  }
  function geometry(value:unknown,depth=0):Geometry{
   if(!value||typeof value!=='object'||depth>8)throw Error('INVALID_GEOMETRY');
   const obj=value as Record<string,unknown>;
   if(obj.type==='Feature')return geometry(obj.geometry,depth+1);
   if(obj.type==='FeatureCollection'){
    if(!Array.isArray(obj.features)||!obj.features.length||obj.features.length>1000)throw Error('INVALID_COLLECTION');
    return {type:'GeometryCollection',geometries:obj.features.map(f=>geometry(f,depth+1))};
   }
   if(obj.type==='GeometryCollection'){
    if(!Array.isArray(obj.geometries)||!obj.geometries.length||obj.geometries.length>1000)throw Error('INVALID_COLLECTION');
    return {type:'GeometryCollection',geometries:obj.geometries.map(g=>geometry(g,depth+1))};
   }
   const depths:Record<string,number>={Point:0,MultiPoint:1,LineString:1,MultiLineString:2,Polygon:2,MultiPolygon:3};
   if(typeof obj.type!=='string'||!(obj.type in depths))throw Error('UNSUPPORTED_GEOMETRY');
   const result={type:obj.type,coordinates:coordinates(obj.coordinates,depths[obj.type])} as Geometry;
   // Do not pass invalid line/ring structures to the map engine.
   const check=(g:Geometry)=>{
    const line=(points:Position[],ring=false)=>{if(points.length<(ring?4:2)||ring&&(points[0][0]!==points.at(-1)![0]||points[0][1]!==points.at(-1)![1]))throw Error('INVALID_LINE')};
    if(g.type==='LineString')line(g.coordinates);
    if(g.type==='MultiLineString')g.coordinates.forEach(p=>line(p));
    if(g.type==='Polygon')g.coordinates.forEach(p=>line(p,true));
    if(g.type==='MultiPolygon')g.coordinates.forEach(p=>p.forEach(r=>line(r,true)));
   };check(result);return result;
  }
  return geometry(input);
 }catch{return null}
}
export function geometryBounds(geometry:Geometry):[number,number,number,number]{
 const bounds:[number,number,number,number]=[Infinity,Infinity,-Infinity,-Infinity];
 const walk=(g:Geometry)=>{if(g.type==='GeometryCollection'){g.geometries.forEach(walk);return}const visit=(v:unknown)=>{if(!Array.isArray(v))return;if(typeof v[0]==='number'&&typeof v[1]==='number'){bounds[0]=Math.min(bounds[0],v[0]);bounds[1]=Math.min(bounds[1],v[1]);bounds[2]=Math.max(bounds[2],v[0]);bounds[3]=Math.max(bounds[3],v[1])}else v.forEach(visit)};visit(g.coordinates)};walk(geometry);return bounds;
}
