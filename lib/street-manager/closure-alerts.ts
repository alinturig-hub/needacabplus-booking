import type {Geometry,Position} from 'geojson';
import {streetGeometry} from './geometry';
import {isPlymouthEvent} from './scope';
import type {PreviewRow} from './preview-data';
import {autocabTime} from '../autocab-time.mjs';
export type TrafficEventKind='closure'|'roadworks'|'restriction'|'incident'|'congestion';
export type ActiveClosure={key:string;street:string;geometry:Geometry;startsAt:number;endsAt:number;reportedOnly:boolean;aliases?:string[];kind?:TrafficEventKind;management?:string|null;source?:'tomtom'|'street-manager'|'council';message?:string};
export type ActiveRoadEvent=ActiveClosure&{kind:TrafficEventKind;management:string|null};
export type DriverFix={driverId:string;vehicleId:string;latitude:number;longitude:number;at:number};
export type ClosureCandidate={driverId:string;vehicleId:string;closureKey:string;street:string;distanceMetres:number;previousDistanceMetres:number;fixAt:number;day:string;message:string;kind?:TrafficEventKind;source?:'tomtom'|'street-manager'|'council';closureBaseKey?:string;dedupKeys?:string[]};
export const alertPolicy={radiusMetres:300,maxFixAgeMs:90000,maxFutureMs:5000,minApproachMetres:10,maxPreviousAgeMs:120000,driverCooldownMs:120000} as const;
const londonDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
export function alertDay(now:number){return londonDay.format(now)}
const string=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null;
const instant=(v:unknown)=>{const s=string(v);return s&&/(?:Z|[+-]\d\d:\d\d)$/i.test(s)?Date.parse(s):NaN};
function endOfLondonDate(value:unknown){
 const date=string(value)?.slice(0,10);if(!date||!/^\d{4}-\d\d-\d\d$/.test(date))return NaN;
 const next=new Date(date+'T12:00:00Z');if(!Number.isFinite(next.getTime()))return NaN;next.setUTCDate(next.getUTCDate()+1);
 return autocabTime(next.toISOString().slice(0,10)+'T00:00:00');
}
const managementText:Record<string,string>={
 lane_closure:'lane closure reported',two_way_signals:'temporary two-way traffic lights',multi_way_signals:'temporary multi-way traffic lights',three_way_signals:'temporary three-way traffic lights',
 give_and_take:'give-and-take traffic control',stop_go_boards:'stop/go traffic control',stop_go_board:'stop/go traffic control',priority_working:'priority traffic control',convoy_working:'convoy traffic control',
 some_carriageway_incursion:'works affecting the carriageway',no_carriageway_incursion:'no carriageway incursion reported',temp_obstruction_15_minute_delay:'temporary obstruction (15-minute delay reported)',temporary_speed_limit:'temporary speed restriction',
};
export function activeRoadEvent(row:PreviewRow,now:number):ActiveRoadEvent|null{
 const d=row.event_data.object_data;
 if(row.source==='archive'||!d||!isPlymouthEvent(d)||!['PERMIT','ACTIVITY'].includes(row.object_type)||Number(row.same_time_versions)>1||row.event_type.endsWith('_REVERTED')||/(?:CANCELLED|REVOKED|REFUSED|CLOSED|WORK_STOP$)/.test(row.event_type))return null;
 if(['completed','cancelled','historical'].includes(String(d.work_status_ref))||['cancelled','revoked','refused','closed'].includes(String(d.permit_status))||d.cancelled==='Yes'||d.cancelled===true||string(d.actual_end_date_time))return null;
 const current=string(d.current_traffic_management_type_ref)??string(d.current_traffic_management_type);
 const management=current??string(d.traffic_management_type_ref)??string(d.traffic_management_type);
 const normalized=management?.toLowerCase().replace(/[ _-]+/g,'_')??null;
 const kind:TrafficEventKind=normalized==='road_closure'?'closure':row.object_type==='PERMIT'?'roadworks':'restriction';
 // Non-work activities must describe a known restriction, not an arbitrary event.
 if(kind==='restriction'&&(!normalized||!managementText[normalized]||normalized==='no_carriageway_incursion'))return null;
 const street=string(d.street_name)?.replace(/[\r\n\t\x00-\x1f]/g,' ').slice(0,120);if(!street)return null;
 let startsAt:number,endsAt:number;
 if(row.object_type==='PERMIT'){
  if(d.work_status_ref!=='in_progress'&&row.event_type!=='WORK_START')return null;
  startsAt=instant(d.actual_start_date_time);
  if(!Number.isFinite(startsAt)&&row.event_type==='WORK_START')startsAt=new Date(row.event_time).getTime();
  // Planned clocks narrow the active window; they never start a planned permit.
  const scheduledStart=instant(d.proposed_start_time);if(Number.isFinite(scheduledStart))startsAt=Math.max(startsAt,scheduledStart);
  endsAt=instant(d.proposed_end_time);if(!Number.isFinite(endsAt))endsAt=endOfLondonDate(d.proposed_end_date);
 }else{
  // Activities have no WORK_START notification. Require explicit start/end clocks,
  // not guessed midnight boundaries, before reporting a scheduled restriction.
  startsAt=instant(d.start_time);endsAt=instant(d.end_time);
 }
 if(!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||startsAt>=endsAt||now<startsAt||now>=endsAt||new Date(row.event_time).getTime()>now+5000)return null;
 const geometry=streetGeometry(d.works_location_coordinates??d.activity_coordinates);if(!geometry)return null;
 const key=string(d.usrn)??street.toUpperCase().replace(/\s+/g,' ');
 return {key,street,geometry,startsAt,endsAt,reportedOnly:current===null,kind,management:normalized};
}
// Retained for callers that explicitly need road closures only.
export function activeClosure(row:PreviewRow,now:number):ActiveClosure|null{const event=activeRoadEvent(row,now);return event?.kind==='closure'?event:null}
export function trafficEventPriority(kind:TrafficEventKind|undefined){return kind===undefined||kind==='closure'?0:kind==='restriction'||kind==='incident'?1:kind==='congestion'?3:2}
// Local tangent-plane distances are sufficient for a 300 m warning radius.
// Measure against the actual segment/area, never just a street centroid.
export function distanceToClosure(lat:number,lng:number,geometry:Geometry):number{
 const rad=Math.PI/180,r=6371008.8;
 const xy=(p:Position):[number,number]=>[(p[0]-lng)*rad*r*Math.cos(lat*rad),(p[1]-lat)*rad*r];
 const distance=(p:Position)=>{const [x,y]=xy(p);return Math.hypot(x,y)};
 const segment=(a:Position,b:Position)=>{const [x,y]=xy(a),[u,v]=xy(b),dx=u-x,dy=v-y,t=Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x+t*dx,y+t*dy)};
 const line=(points:Position[])=>Math.min(...points.slice(1).map((p,i)=>segment(points[i],p)));
 const inside=(ring:Position[])=>{let contained=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [x,y]=xy(ring[i]),[u,v]=xy(ring[j]);if((y>0)!==(v>0)&&0<(u-x)*(-y)/(v-y)+x)contained=!contained}return contained};
 const polygon=(rings:Position[][])=>inside(rings[0])&&!rings.slice(1).some(inside)?0:Math.min(...rings.map(line));
 switch(geometry.type){
  case 'Point':return distance(geometry.coordinates);
  case 'MultiPoint':return Math.min(...geometry.coordinates.map(distance));
  case 'LineString':return line(geometry.coordinates);
  case 'MultiLineString':return Math.min(...geometry.coordinates.map(line));
  case 'Polygon':return polygon(geometry.coordinates);
  case 'MultiPolygon':return Math.min(...geometry.coordinates.map(polygon));
  case 'GeometryCollection':return Math.min(...geometry.geometries.map(g=>distanceToClosure(lat,lng,g)));
 }
}
function validFix(fix:DriverFix,now:number){return !!fix.driverId&&!fix.driverId.startsWith('vehicle:')&&!!fix.vehicleId&&Number.isFinite(fix.at)&&fix.at<=now+alertPolicy.maxFutureMs&&now-fix.at<=alertPolicy.maxFixAgeMs&&Number.isFinite(fix.latitude)&&Number.isFinite(fix.longitude)&&Math.abs(fix.latitude)<=90&&Math.abs(fix.longitude)<=180&&!(fix.latitude===0&&fix.longitude===0)}
export function approachingClosure(current:DriverFix,previous:DriverFix,closure:ActiveClosure,now:number):ClosureCandidate|null{
 if(!validFix(current,now)||!validFix(previous,current.at)||current.driverId!==previous.driverId||current.vehicleId!==previous.vehicleId||previous.at>=current.at||current.at-previous.at>alertPolicy.maxPreviousAgeMs||now<closure.startsAt||now>=closure.endsAt)return null;
 const distanceMetres=distanceToClosure(current.latitude,current.longitude,closure.geometry),previousDistanceMetres=distanceToClosure(previous.latitude,previous.longitude,closure.geometry);
 const elapsed=(current.at-previous.at)/1000;
 // Discard implausible jumps (>180 km/h) instead of treating GPS noise as approach.
 const moved=distanceToClosure(current.latitude,current.longitude,{type:'Point',coordinates:[previous.longitude,previous.latitude]});
 if(moved/elapsed>50||!Number.isFinite(distanceMetres)||distanceMetres>alertPolicy.radiusMetres||previousDistanceMetres-distanceMetres<alertPolicy.minApproachMetres)return null;
 const street=closure.street===closure.street.toUpperCase()?closure.street.toLowerCase().replace(/\b\p{L}/gu,c=>c.toUpperCase()):closure.street;
 const kind=closure.kind??'closure',detail=closure.management?managementText[closure.management]:null;
 const prefix=(kind==='roadworks'?'Roadworks':'Traffic restrictions')+' reported nearby on ',suffix=detail?': '+detail+'.':'.';
 const maxStreet=185-prefix.length-suffix.length,displayStreet=street.length>maxStreet?street.slice(0,maxStreet-1)+'…':street;
 const message=closure.message|| (kind==='closure'?street+' is reported closed nearby.':prefix+displayStreet+suffix);
 // A previous roadworks warning must not suppress a later closure on the same street.
 const closureKey=kind==='closure'?closure.key:kind+':'+closure.key;
 const baseKeys=[...new Set([closure.key,...(closure.aliases||[])])].slice(0,128),eventKeys=kind==='closure'?baseKeys:baseKeys.map(k=>kind+':'+k),dedupKeys=kind==='closure'?eventKeys:[...eventKeys,...baseKeys];
 return {dedupKeys,driverId:current.driverId,vehicleId:current.vehicleId,closureKey,street,distanceMetres:Math.round(distanceMetres),previousDistanceMetres:Math.round(previousDistanceMetres),fixAt:current.at,day:alertDay(now),message,kind,source:closure.source,closureBaseKey:closure.key};
}
