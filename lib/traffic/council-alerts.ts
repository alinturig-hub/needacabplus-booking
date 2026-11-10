import type {PoolClient} from 'pg';
import type {Geometry} from 'geojson';
import {z} from 'zod';
import {autocabTime} from '../autocab-time.mjs';
import type {CouncilNotice} from '../street-manager/council';
import {councilPreviewItem} from '../street-manager/supplementary-view';
import type {ActiveRoadEvent} from '../street-manager/closure-alerts';
import type {PreviewItem} from '../street-manager/preview-data';
import {driver62PilotMatches} from './driver62-alerts';
import {londonDateWindow,reportsMatch,sameRoadArea} from './correlation';
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
const point=z.tuple([z.number().min(-4.26).max(-3.93),z.number().min(50.30).max(50.51)]);
const councilGeometry=z.union([z.object({type:z.literal('Point'),coordinates:point}),z.object({type:z.literal('LineString'),coordinates:z.array(point).min(2).max(10000)})]);
export type CouncilAlertRow={id:string;notice_data:CouncilNotice;geometry:Geometry|null;location_quality:'unmapped'|'approximate'|'verified';location_basis:string|null;source_checked_at:Date|string};
export type CouncilAlertStatus={enabled:boolean;status:'disabled'|'idle'|'unavailable'|'stale'|'ready'|'awaiting_tomtom';checkedAt:string|null;lastSuccessAt:string|null;notices:number;eligible:number;matched:number;needsReview:number;error:string|null};
export function councilDriver62Enabled(env:Record<string,string|undefined>=process.env){return env.COUNCIL_DRIVER62_ALERTS_ENABLED==='true'&&driver62PilotMatches(env);}
function addDay(value:string,days:number){const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function time(hour:string,minute:string|undefined,period:string|undefined){let h=Number(hour);const m=Number(minute||0);if(m>59||h>23||period&&(h<1||h>12))return null;if(period)h=h%12+(period.toLowerCase()==='pm'?12:0);return h*60+m;}
export function councilActiveWindow(n:CouncilNotice,now:number):[number,number]|null{
 const dates=londonDateWindow(n.startDate,n.endDate);if(!dates)return null;
 if(/\b(?:cancelled|canceled|postponed|withdrawn)\b/i.test([n.street,n.description,n.dateText].join(' ')))return null;
 const text=n.traffic.toLowerCase();
 if(/\b(?:cancelled|canceled|postponed|tbc|tba|intermittent|as required|subject to)\b/.test(text)||/\b(?:holiday|sundays?|saturdays?)\b/.test(text)||/\b(?:except|excluding|unless)\b/.test(text)&&!/except weekends|excluding weekends/.test(text))return null;
 const weekdays=/\b(?:mon(?:day)?\s*(?:to|-)\s*fri(?:day)?|weekdays|except weekends|excluding weekends)\b/.test(text);
 const clock='(\\d{1,2})(?:[.:](\\d{2}))?\\s*(am|pm)?';
 const matches=[...text.matchAll(new RegExp('\\b'+clock+'\\s*(?:to|-)\\s*'+clock+'\\b','g'))];
 const wholeDay=/\b24\s*(?:hrs?|hours?)\b|\b24\s*\/\s*7\b/.test(text);
 if(wholeDay&&matches.length||!wholeDay&&matches.length!==1)return null;
 let day=dateFormat.format(now),window:[number,number];
 if(wholeDay)window=dates;
 else{
  const m=matches[0],a=time(m[1],m[2],m[3]),b=time(m[4],m[5],m[6]);
  // Do not infer a missing AM/PM or silently interpret ambiguous 12-hour clocks.
  if(a===null||b===null||a===b||!!m[3]!==!!m[6]||(!m[3]&&(!m[2]||!m[5])))return null;
  const at=(date:string,minutes:number)=>autocabTime(date+`T${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}:00`);
  if(b<a&&now<at(day,b))day=addDay(day,-1);
  if(day<n.startDate||day>n.endDate)return null;
  window=[at(day,a),at(b<a?addDay(day,1):day,b)];
 }
 if(weekdays&&[0,6].includes(new Date(day+'T12:00:00Z').getUTCDay()))return null;
 return Number.isFinite(window[0])&&Number.isFinite(window[1])&&now>=window[0]&&now<window[1]?window:null;
}
export function councilAlert(row:CouncilAlertRow,now:number):ActiveRoadEvent|null{
 const n=row.notice_data,window=councilActiveWindow(n,now),g=councilGeometry.safeParse(row.geometry),checked=new Date(row.source_checked_at).getTime();
 if(!window||!g.success||row.location_quality!=='verified'||!['junction','segment'].includes(row.location_basis||'')||!Number.isFinite(checked)||now-checked>12*3600000||checked>now+5000)return null;
 const text=n.traffic.toLowerCase(),kind=/road closure/.test(text)?'closure':/signals|lane closure|stop.go|give.and.take/.test(text)?'restriction':/roadworks|works|traffic management/.test(text)?'roadworks':null;
 if(!kind)return null;
 const street=n.street.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,120);if(!street)return null;
 const label=kind==='closure'?'a scheduled road closure':kind==='restriction'?'scheduled traffic restrictions':'scheduled roadworks',prefix=`Council notice: ${label} nearby on `,suffix='. Check signs.',available=185-prefix.length-suffix.length;
 return {key:'COUNCIL:'+n.id,street,geometry:g.data,startsAt:window[0],endsAt:window[1],kind,management:null,reportedOnly:true,source:'council',message:prefix+(street.length>available?street.slice(0,available-1)+'…':street)+suffix};
}
export function councilFallbacks(rows:CouncilAlertRow[],knownReports:PreviewItem[],active:ActiveRoadEvent[],now:number){
 const events:ActiveRoadEvent[]=[],relatedEvents:ActiveRoadEvent[]=[];let matched=0,needsReview=0;
 for(const row of rows){
  const view=councilPreviewItem(row,now),event=councilAlert(row,now);
  const known=knownReports.some(r=>reportsMatch(view,r))||event&&active.some(r=>Math.max(event.startsAt,r.startsAt)<Math.min(event.endsAt,r.endsAt)&&sameRoadArea(event,r));
  if(known){matched++;if(event)relatedEvents.push(event);continue;}
  if(!event){needsReview++;continue;}
  if(events.some(e=>sameRoadArea(e,event)&&Math.max(e.startsAt,event.startsAt)<Math.min(e.endsAt,event.endsAt))){matched++;continue;}
  events.push(event);
 }
 return {events,relatedEvents,matched,needsReview};
}
export async function loadCouncilAlerts(client:Pick<PoolClient,'query'>,eligible:boolean,tomtomReady:boolean,known:PreviewItem[],active:ActiveRoadEvent[],now=Date.now()):Promise<{events:ActiveRoadEvent[];relatedEvents?:ActiveRoadEvent[];status:CouncilAlertStatus}>{
 const enabled=councilDriver62Enabled(),base:CouncilAlertStatus={enabled,status:enabled?'idle':'disabled',checkedAt:null,lastSuccessAt:null,notices:0,eligible:0,matched:0,needsReview:0,error:null};
 if(!enabled||!eligible)return {events:[],status:base};
 try{
  const ready=(await client.query("SELECT to_regclass('public.street_manager_council_notices') IS NOT NULL AND to_regclass('public.street_manager_source_runs') IS NOT NULL AS ready")).rows[0]?.ready;
  if(!ready)return {events:[],status:{...base,status:'unavailable',error:'Council storage is not ready.'}};
  const run=(await client.query("SELECT status,checked_at,last_success_at,error_code,item_count,details FROM street_manager_source_runs WHERE source='plymouth_council'")).rows[0];
  const checkedAt=run?.checked_at?new Date(run.checked_at).toISOString():null,lastSuccessAt=run?.last_success_at?new Date(run.last_success_at).toISOString():null;
  const status={...base,checkedAt,lastSuccessAt,notices:Number(run?.item_count||0),error:run?.details?.transport==='operator_snapshot'&&run?.details?.directFetchError?'Operator-checked snapshot; direct Council refresh remains unavailable.':null};
  if(run?.status!=='ok'||!lastSuccessAt||now-Date.parse(lastSuccessAt)>12*3600000||Date.parse(lastSuccessAt)>now+5000)return {events:[],status:{...status,status:'stale',error:'A fresh successful Council publication is required.'}};
  if(!tomtomReady)return {events:[],status:{...status,status:'awaiting_tomtom',error:'Council-only alerts wait for a current TomTom comparison.'}};
  const rows=(await client.query<CouncilAlertRow>('SELECT id,notice_data,geometry,location_quality,location_basis,source_checked_at FROM street_manager_council_notices WHERE in_current_snapshot ORDER BY id')).rows;
  const result=councilFallbacks(rows,known,active,now);
  return {events:result.events,relatedEvents:result.relatedEvents,status:{...status,status:'ready',eligible:result.events.length,matched:result.matched,needsReview:result.needsReview}};
 }catch{return {events:[],status:{...base,status:'unavailable',error:'Council comparison is temporarily unavailable.'}};}
}
