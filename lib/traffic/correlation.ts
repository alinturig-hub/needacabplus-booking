import type {Geometry} from 'geojson';
import type {PreviewItem} from '../street-manager/preview-data';
import {autocabTime} from '../autocab-time.mjs';
export function normalizedRoadNames(street:string){return street.toLowerCase().replace(/\([^)]*\)/g,'').replace(/\brd\b/g,'road').replace(/\bst\b/g,'street').replace(/\bave\b/g,'avenue').split(/\s+to\s+|\//).map(s=>s.replace(/[^\p{L}\p{N}]+/gu,' ').trim()).filter(Boolean);}
export function reportBounds(g:Geometry):[number,number,number,number]{
 const b:[number,number,number,number]=[Infinity,Infinity,-Infinity,-Infinity];
 const visit=(v:unknown)=>{if(!Array.isArray(v))return;if(typeof v[0]==='number'&&typeof v[1]==='number'){b[0]=Math.min(b[0],v[0]);b[1]=Math.min(b[1],v[1]);b[2]=Math.max(b[2],v[0]);b[3]=Math.max(b[3],v[1]);}else v.forEach(visit)};
 const walk=(v:Geometry)=>{if(v.type==='GeometryCollection')v.geometries.forEach(walk);else visit(v.coordinates)};walk(g);return b;
}
export function sameRoadArea(a:{street:string;geometry:Geometry},b:{street:string;geometry:Geometry}){
 if(!normalizedRoadNames(a.street).some(s=>normalizedRoadNames(b.street).includes(s)))return false;
 const x=reportBounds(a.geometry),y=reportBounds(b.geometry),lat=75/111195,lon=lat/Math.cos((x[1]+x[3])/2*Math.PI/180);
 return x[0]<=y[2]+lon&&x[2]>=y[0]-lon&&x[1]<=y[3]+lat&&x[3]>=y[1]-lat;
}
export function londonDateWindow(start:string,end:string):[number,number]|null{
 if(!/^\d{4}-\d\d-\d\d$/.test(start)||!/^\d{4}-\d\d-\d\d$/.test(end))return null;
 const first=new Date(start+'T12:00:00Z'),last=new Date(end+'T12:00:00Z');if(!Number.isFinite(first.getTime())||!Number.isFinite(last.getTime())||last.toISOString().slice(0,10)!==end||first.toISOString().slice(0,10)!==start)return null;
 last.setUTCDate(last.getUTCDate()+1);const a=autocabTime(start+'T00:00:00'),b=autocabTime(last.toISOString().slice(0,10)+'T00:00:00');return Number.isFinite(a)&&Number.isFinite(b)&&a<b?[a,b]:null;
}
export function reportWindow(item:PreviewItem):[number,number]|null{
 if(item.tomtom){const a=Date.parse(item.tomtom.startsAt||''),b=Date.parse(item.tomtom.endsAt||'')||Date.parse(item.receivedAt)+120000;return Number.isFinite(a)&&Number.isFinite(b)&&a<b?[a,b]:null;}
 const get=(labels:string[])=>labels.map(label=>item.details.find(d=>d.label===label)).find(d=>d?.value);
 const start=get(['Actual start','Activity start time','Proposed start time','Start']),end=get(['Actual end','Activity end time','Proposed end time','Expected end']);
 if(start?.value&&end?.value){const a=Date.parse(start.value),b=Date.parse(end.value);if(Number.isFinite(a)&&Number.isFinite(b)&&a<b)return [a,b];}
 const first=get(['Published start date','Activity / restriction start date','Proposed start date']),last=get(['Published end date','Activity / restriction end date','Proposed end date']);
 const firstDate=start?.value||first?.value,lastDate=end?.value||last?.value;return firstDate&&lastDate?londonDateWindow(firstDate.slice(0,10),lastDate.slice(0,10)):null;
}
export function reportsMatch(a:PreviewItem,b:PreviewItem){
 if(!a.geometry||!b.geometry||a.source==='archive'||b.source==='archive'||a.sourceStale||b.sourceStale)return false;
 const x=reportWindow(a),y=reportWindow(b);return !!x&&!!y&&Math.max(x[0],y[0])<Math.min(x[1],y[1])&&sameRoadArea({street:a.street,geometry:a.geometry},{street:b.street,geometry:b.geometry});
}
const label=(item:PreviewItem)=>item.source==='tomtom'?'TomTom':item.source==='council'?'Plymouth Council':item.source==='archive'?'Street Manager archive':'Street Manager';
export function mergeTrafficReports(items:PreviewItem[]):PreviewItem[]{
 const groups:PreviewItem[][]=[],index=new Map<string,Set<number>>();
 for(const item of items){
  const names=normalizedRoadNames(item.street),candidates=new Set(names.flatMap(n=>[...(index.get(n)||[])]));
  const matches=[...candidates].filter(i=>!groups[i].some(r=>r.source===item.source)&&groups[i].every(r=>reportsMatch(r,item)));
  // Ambiguous multiple matches remain separate instead of collapsing distinct works.
  const i=matches.length===1?matches[0]:groups.length;if(i===groups.length)groups.push([]);groups[i].push(item);
  for(const name of names){const bucket=index.get(name)||new Set<number>();bucket.add(i);index.set(name,bucket);}
 }
 return groups.map(reports=>{
  if(reports.length===1)return reports[0];
  const ranked=[...reports].sort((a,b)=>(a.state==='in_progress'?0:1)-(b.state==='in_progress'?0:1)||(a.source==='webhook'?0:a.source==='tomtom'?1:2)-(b.source==='webhook'?0:b.source==='tomtom'?1:2));
  const primary=ranked[0],conflict=reports.some(r=>r.state==='ended')&&reports.some(r=>r.state==='in_progress'||r.source==='council'&&r.state==='unknown');
  return {...primary,relatedReports:reports,state:conflict?'unknown':primary.state,status:conflict?'Source reports disagree; review required':primary.status,warnings:[...new Set(reports.flatMap(r=>r.warnings)),...(conflict?['A source reports completion/cancellation while another still lists this event. Review before treating it as active.']:[]),'Related reports matched by road name, nearby geometry and overlapping dates; they are shown as one map event.'],details:reports.flatMap(r=>[{label:label(r)+' · reference',value:r.reference},...r.details.map(d=>({...d,label:label(r)+' · '+d.label}))])};
 });
}
