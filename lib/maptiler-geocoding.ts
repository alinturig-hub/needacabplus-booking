type JsonRecord=Record<string,unknown>;
export type MapTilerFeature={id:string;label:string;name:string;longitude:number;latitude:number;types:string[];category:string};

function record(value:unknown):JsonRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{}}
function text(value:unknown){return typeof value==='string'?value.trim():''}
function number(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?parsed:null}
function coordinates(value:unknown){if(!Array.isArray(value)||value.length<2)return null;const longitude=number(value[0]),latitude=number(value[1]);return longitude!==null&&latitude!==null&&Math.abs(longitude)<=180&&Math.abs(latitude)<=90?{longitude,latitude}:null}
function radians(value:number){return value*Math.PI/180}
function distanceMetres(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){const radius=6371000,dLat=radians(b.latitude-a.latitude),dLon=radians(b.longitude-a.longitude),x=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLon/2)**2;return Math.round(2*radius*Math.asin(Math.sqrt(x)))}

export function mapTilerFeatures(payload:unknown){
 const root=record(payload),features=Array.isArray(root.features)?root.features:[];
 return features.flatMap((value,index)=>{const feature=record(value),properties=record(feature.properties),geometry=record(feature.geometry),point=coordinates(feature.center)||coordinates(geometry.coordinates);if(!point)return[];const name=text(feature.text)||text(properties.name)||text(feature.name),label=text(feature.place_name)||text(properties.place_name)||text(properties.label)||name;if(!label)return[];const rawTypes=Array.isArray(feature.place_type)?feature.place_type:Array.isArray(properties.types)?properties.types:[];return[{id:text(feature.id)||`maptiler-${index}`,label,name:name||label.split(',')[0]||label,...point,types:rawTypes.map(String),category:text(properties.kind)||text(properties.class)||text(properties.category)}]}) as MapTilerFeature[];
}

function mapTilerHeaders(){return{Accept:'application/json',Origin:'https://webapp.needacabplus.app',Referer:'https://webapp.needacabplus.app/'}}
async function mapTilerRequest(path:string,apiKey:string,parameters:Record<string,string|number|boolean>,signal?:AbortSignal){
 const search=new URLSearchParams({key:apiKey,...Object.fromEntries(Object.entries(parameters).map(([key,value])=>[key,String(value)]))});
 const response=await fetch(`https://api.maptiler.com/geocoding/${path}.json?${search}`,{headers:mapTilerHeaders(),signal,cache:'no-store'});
 if(!response.ok)throw new Error(`MapTiler geocoding returned HTTP ${response.status}.`);
 return mapTilerFeatures(await response.json());
}

export async function searchMapTiler(query:string,apiKey:string,options:{country:string;language:string;longitude:number;latitude:number},signal?:AbortSignal){return mapTilerRequest(encodeURIComponent(query),apiKey,{autocomplete:true,fuzzyMatch:true,limit:8,country:options.country,language:options.language,proximity:`${options.longitude},${options.latitude}`},signal)}
export async function reverseMapTiler(latitude:number,longitude:number,apiKey:string,options:{country:string;language:string},signal?:AbortSignal){return mapTilerRequest(`${longitude},${latitude}`,apiKey,{limit:10,country:options.country,language:options.language},signal)}

const nonPlaceTypes=new Set(['address','street','postcode','postal_code','neighbourhood','locality','municipality','county','region','country']);
export function nearestMapTilerPlace(features:MapTilerFeature[],latitude:number,longitude:number,maxDistance:number){
 const candidates=features.flatMap(feature=>{const isPlace=feature.types.some(type=>type==='poi'||type==='poi.landmark')||Boolean(feature.category&&!nonPlaceTypes.has(feature.category));if(!isPlace||!feature.name||/^\d/.test(feature.name))return[];const distance=distanceMetres({latitude,longitude},feature);return distance<=maxDistance?[{name:feature.name,type:feature.category||feature.types[0]||'place',latitude:feature.latitude,longitude:feature.longitude,distanceMetres:distance}]:[]});
 return candidates.sort((a,b)=>a.distanceMetres-b.distanceMetres||a.name.localeCompare(b.name))[0]||null;
}
