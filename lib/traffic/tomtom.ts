import {z} from 'zod';
import {geometryBounds} from '../street-manager/geometry';
import type {PreviewItem} from '../street-manager/preview-data';

export const trafficBounds=[-4.25,50.32,-4.02,50.46] as const;
export const trafficRefreshSeconds=120;
export type TrafficFeed={status:'ok'|'unavailable'|'not_configured';checkedAt:string;error:string|null;items:PreviewItem[];total:number;omitted:number;retryAfterSeconds?:number;lastReceived?:string|null};
const point=z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)]);
const geometry=z.union([z.object({type:z.literal('Point'),coordinates:point}),z.object({type:z.literal('LineString'),coordinates:z.array(point).min(2).max(10000)})]);
const incident=z.object({geometry,properties:z.object({id:z.string().min(1).max(500),iconCategory:z.number().int(),from:z.string().max(3000).nullish(),to:z.string().max(3000).nullish(),startTime:z.string().nullish(),endTime:z.string().nullish(),lastReportTime:z.string().nullish(),delay:z.number().nonnegative().nullish(),length:z.number().nonnegative().nullish(),magnitudeOfDelay:z.number().nullish(),roadNumbers:z.array(z.string()).max(100).nullish(),events:z.array(z.object({description:z.string().max(3000),code:z.number().optional(),iconCategory:z.number().optional()})).max(100),timeValidity:z.string().nullish()})});
const categories:Record<number,string>={0:'Traffic incident',1:'Accident',2:'Fog',3:'Dangerous conditions',4:'Rain',5:'Ice',6:'Congestion',7:'Lane closed',8:'Road closed',9:'Roadworks',10:'Wind',11:'Flooding',14:'Broken-down vehicle'};
function iso(value:string|null|undefined){if(!value||!/(?:Z|[+-]\d\d:\d\d)$/i.test(value))return null;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null}
export function tomtomItem(value:unknown,now=Date.now()):PreviewItem|null{
 const parsed=incident.safeParse(value);if(!parsed.success)return null;
 const {geometry:g,properties:p}=parsed.data,b=geometryBounds(g),[w,s,e,n]=trafficBounds;
 if(b[2]<w||b[0]>e||b[3]<s||b[1]>n)return null;
 const start=iso(p.startTime),end=iso(p.endTime),reported=iso(p.lastReportTime),checked=new Date(now).toISOString();
 const state=end&&Date.parse(end)<=now?'ended':start&&Date.parse(start)>now?'planned':'in_progress';
 const category=categories[p.iconCategory]||'Traffic incident',description=p.events.map(event=>event.description).join(' · '),street=p.from?.trim()||p.roadNumbers?.join(', ')||'Location reported by TomTom';
 return {id:'TOMTOM:'+p.id,reference:p.id,workReference:null,type:'TOMTOM',title:street,street,town:null,status:category,state,traffic:description||category,color:state==='ended'?'#8b99a5':p.iconCategory===8?'#f87171':p.iconCategory===6?'#fb923c':p.iconCategory===9?'#f5be58':'#60a5fa',updatedAt:reported||checked,receivedAt:checked,geometry:g,bounds:b,source:'tomtom',locationQuality:'reported',tomtom:{categories:[...new Set([p.iconCategory,...p.events.flatMap(e=>e.iconCategory===undefined?[]:[e.iconCategory])])],timeValidity:p.timeValidity??null,startsAt:start,endsAt:end,delaySeconds:p.delay??null},warnings:['TomTom-reported incident. A second source may report the same real-world event; these records are kept separate.'],details:[{label:'Source',value:'TomTom Traffic'},{label:'Incident type',value:category},{label:'Description',value:description||null},{label:'From',value:p.from||null},{label:'To',value:p.to||null},{label:'Road numbers',value:p.roadNumbers?.join(', ')||null},{label:'Start',value:start,format:'datetime'},{label:'Expected end',value:end,format:'datetime'},{label:'Reported delay',value:p.delay===null||p.delay===undefined?null:Math.round(p.delay)+' seconds'},{label:'Affected length',value:p.length===null||p.length===undefined?null:Math.round(p.length)+' m'},{label:'Last source report',value:reported,format:'datetime'},{label:'Fetched',value:checked,format:'datetime'}]};
}
export async function loadTomtomTraffic({key=process.env.TOMTOM_API_KEY,fetcher=fetch,now=Date.now()}: {key?:string;fetcher?:typeof fetch;now?:number}={}):Promise<TrafficFeed>{
 const base={checkedAt:new Date(now).toISOString(),items:[] as PreviewItem[],total:0,omitted:0};
 if(!key?.trim())return {...base,status:'not_configured',error:'TomTom API key is not configured.'};
 const url=new URL('https://api.tomtom.com/traffic/services/5/incidentDetails');
 url.search=new URLSearchParams({key:key.trim(),bbox:trafficBounds.join(','),fields:'{incidents{geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity,lastReportTime}}}',language:'en-GB',timeValidityFilter:'present'}).toString();
 try{
  // No shared response cache, permanent provider archive or key in client code.
  const response=await fetcher(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
  if(!response.ok){const retry=Number(response.headers.get('retry-after'));return {...base,status:'unavailable',error:response.status===401||response.status===403?'TomTom rejected the API credentials or product access.':response.status===429?'TomTom request limit reached.':'TomTom is temporarily unavailable.',...(response.status===429?{retryAfterSeconds:Number.isFinite(retry)&&retry>0?Math.min(86400,Math.ceil(retry)):120}:{})};}
  const reader=response.body?.getReader();if(!reader)throw Error('NO_BODY');let bytes=0;const chunks:Uint8Array[]=[];
  for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4000000){await reader.cancel();throw Error('BODY_LIMIT')}chunks.push(part.value);}
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {incidents?:unknown};
  if(!Array.isArray(payload.incidents)||payload.incidents.length>5000)throw Error('INVALID_RESPONSE');
  const seen=new Set<string>(),items=payload.incidents.flatMap(value=>{const item=tomtomItem(value,now);if(!item||seen.has(item.id))return [];seen.add(item.id);return [item]});
  return {...base,status:'ok',error:null,items,total:payload.incidents.length,omitted:payload.incidents.length-items.length};
 }catch{return {...base,status:'unavailable',error:'TomTom could not be reached or returned an invalid response.'};}
}
