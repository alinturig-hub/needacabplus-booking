import {composeTrafficMessage,type AlertTiming} from './message-timing';
import {sameRoadArea,normalizedRoadNames,reportBounds} from './correlation';
import {loadTomtomTraffic,trafficRefreshSeconds,type TrafficFeed} from './tomtom';
import type {PreviewItem} from '../street-manager/preview-data';
import type {ActiveRoadEvent,TrafficEventKind} from '../street-manager/closure-alerts';
export const tomtomDriver62={driverId:'1364',callsign:'62'} as const;
const ttl=trafficRefreshSeconds*1000;
type Env=Record<string,string|undefined>;
export function driver62PilotMatches(env:Env=process.env){return env.ROAD_CLOSURE_ALERTS_MODE==='pilot'&&env.ROAD_CLOSURE_PILOT_DRIVER_ID===tomtomDriver62.driverId&&env.ROAD_CLOSURE_PILOT_CALLSIGN===tomtomDriver62.callsign;}
export function tomtomDriver62Enabled(env:Env=process.env){return env.TOMTOM_DRIVER62_ALERTS_ENABLED==='true'&&driver62PilotMatches(env);}
const clean=(s:string)=>s.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
export function tomtomAlert(item:PreviewItem,now:number):ActiveRoadEvent|null{
 const p=item.tomtom,fetched=Date.parse(item.receivedAt);
 if(item.source!=='tomtom'||!p||p.timeValidity!=='present'||!item.geometry||!item.bounds||!Number.isFinite(fetched)||fetched>now+5000||now-fetched>=ttl)return null;
 const startsAt=Date.parse(p.startsAt||''),end=p.endsAt===null?fetched+ttl:Date.parse(p.endsAt);
 if(!Number.isFinite(startsAt)||!Number.isFinite(end)||startsAt>now||end<=now||startsAt>=end)return null;
 const categories=p.categories;
 let kind:TrafficEventKind,description:string;
 if(categories.includes(8)){kind='closure';description='a road closure';}
 else if(categories.includes(7)){kind='restriction';description='a lane closure';}
 else if(categories.includes(1)){kind='incident';description='an accident';}
 else if(categories.includes(9)){kind='roadworks';description='roadworks';}
 else if(categories.includes(6)){kind='congestion';description='congestion';}
 else {kind='incident';description=categories.includes(14)?'a broken-down vehicle':categories.includes(11)?'flooding':categories.includes(5)?'ice':categories.includes(2)?'fog':categories.includes(3)?'dangerous conditions':categories.includes(4)?'rain':categories.includes(10)?'wind':'';if(!description)return null;}
 const from=clean(item.details.find(d=>d.label==='From')?.value||item.street),to=clean(item.details.find(d=>d.label==='To')?.value||'');
 if(!from||from==='Location reported by TomTom')return null;
 const location=to&&to!==from?`${from} to ${to}`:from;
 const prefix=`TomTom reports ${description} nearby (`,delay=kind==='congestion'&&p.delaySeconds!==null?` Delay ~${Math.max(1,Math.round(p.delaySeconds/60))} min.`:'',suffix=').'+delay;
 const timing:AlertTiming={from:p.startsAt,to:p.endsAt,expectedEnd:true};
 const message=composeTrafficMessage(prefix,location,suffix,timing);
 return {key:'TOMTOM:'+item.reference,street:location.slice(0,120),geometry:item.geometry,startsAt,endsAt:Math.min(end,fetched+ttl),kind,management:null,reportedOnly:true,source:'tomtom',message,timing};
}
export const sameReportedRoad=sameRoadArea;
export function combineAlertEvents(street:ActiveRoadEvent[],tomtom:ActiveRoadEvent[]){
 const added:ActiveRoadEvent[]=[];
 for(const event of [...tomtom].sort((a,b)=>a.key.localeCompare(b.key))){
  const matched=street.find(s=>sameReportedRoad(event,s));
  // Prefer the signed Street Manager event for overlapping reports of the same kind.
  if(matched&&matched.kind===event.kind||added.some(s=>s.kind===event.kind&&sameReportedRoad(event,s)))continue;
  added.push(matched?{...event,key:matched.key}:event);
 }
 return [...street,...added];
}
export type TomtomPilotStatus={enabled:boolean;status:'disabled'|'idle'|'waiting'|'ok'|'unavailable'|'not_configured';checkedAt:string|null;expiresAt:string|null;nextAttemptAt:string|null;events:number;error:string|null};
export function createDriver62Feed(loader:()=>Promise<TrafficFeed>=()=>loadTomtomTraffic(),env:()=>Env=()=>process.env){
 let events:ActiveRoadEvent[]=[],checkedAt:string|null=null,expires=0,next=0,status:TomtomPilotStatus['status']='disabled',error:string|null=null;
 async function read(eligible:boolean,now:number,refresh=false):Promise<{events:ActiveRoadEvent[];status:TomtomPilotStatus}>{
  const enabled=tomtomDriver62Enabled(env());
  if(!enabled||!eligible){events=[];expires=0;status=enabled?'idle':'disabled';error=null;}
  else if(refresh&&now>=next){
   next=now+ttl;events=[];expires=0;
   try{
    const result=await loader();checkedAt=result.checkedAt;status=result.status;error=result.error;
    if(result.status==='ok'){expires=Date.parse(result.checkedAt)+ttl;events=result.items.map(i=>tomtomAlert(i,now)).filter((e):e is ActiveRoadEvent=>e!==null);}
    else if(result.retryAfterSeconds)next=now+Math.max(trafficRefreshSeconds,result.retryAfterSeconds)*1000;
   }catch{status='unavailable';error='TomTom refresh failed.';}
  }
  if(enabled&&eligible&&expires<=now){events=[];if(status==='ok'||status==='disabled'||status==='idle')status='waiting';}
  events=events.filter(e=>e.startsAt<=now&&e.endsAt>now);
  return {events,status:{enabled,status,checkedAt,expiresAt:expires?new Date(expires).toISOString():null,nextAttemptAt:next?new Date(next).toISOString():null,events:events.length,error}};
 }
 return {read};
}
export const driver62TomtomFeed=createDriver62Feed();

// A shared road identity includes locality, so same-named distant roads stay distinct.
export function correlatedAlertKeys(events:ActiveRoadEvent[],context:ActiveRoadEvent[]=events):ActiveRoadEvent[]{
 const roadKeys=(event:ActiveRoadEvent)=>{
  const b=reportBounds(event.geometry),x0=Math.floor((b[0]*71000-75)/250),x1=Math.floor((b[2]*71000+75)/250),y0=Math.floor((b[1]*111195-75)/250),y1=Math.floor((b[3]*111195+75)/250),x=Math.floor((b[0]+b[2])/2*71000/250),y=Math.floor((b[1]+b[3])/2*111195/250),names=normalizedRoadNames(event.street);
  const cells:[number,number][]=[];if((x1-x0+1)*(y1-y0+1)<=1024)for(let i=x0;i<=x1;i++)for(let j=y0;j<=y1;j++)cells.push([i,j]);cells.sort((a,b)=>Math.hypot(a[0]-x,a[1]-y)-Math.hypot(b[0]-x,b[1]-y));
  return {primary:names[0]?`ROAD:${names[0]}:${x}:${y}`:event.key,aliases:names.flatMap(name=>[[x,y],...cells].map(([i,j])=>`ROAD:${name}:${i}:${j}`))};
 };
 return events.map(event=>{
  const related=context.filter(other=>Math.max(event.startsAt,other.startsAt)<Math.min(event.endsAt,other.endsAt)&&sameRoadArea(event,other)),own=roadKeys(event);
  const aliases=[...new Set([event.key,...(event.aliases||[]),...related.flatMap(r=>[r.key,...(r.aliases||[]),roadKeys(r).primary]),...own.aliases,...related.flatMap(r=>roadKeys(r).aliases)])].slice(0,128);
  return {...event,key:own.primary,aliases};
 });
}
