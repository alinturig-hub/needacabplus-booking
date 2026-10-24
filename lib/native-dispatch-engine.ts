// Deterministic rule core. Live adapters own authentication, durable state,
// transactional claims, offer delivery and server-authoritative timestamps.
import {z} from 'zod';
import {milesBetween} from './dispatch-routing';
export const nativeDispatchRulesSchema=z.object({
 method:z.enum(['zone_queue','nearest']).default('nearest'),control:z.enum(['manual','automatic']).default('manual'),
 offerSeconds:z.number().int().min(5).max(3600).default(60),progressiveOffers:z.boolean().default(true),driverCount:z.number().int().min(1).max(20).default(5),
 maximumRadiusMiles:z.number().positive().max(100).default(8),gpsFreshnessSeconds:z.number().int().min(10).max(300).default(120),
 noFarePriority:z.boolean().default(true),
 automaticRules:z.array(z.object({metric:z.enum(['free_drivers','pending_bookings']),operator:z.enum(['gte','lt']),threshold:z.number().int().min(0).max(10000),method:z.enum(['zone_queue','nearest'])}).strict()).max(20).default([]),
}).strict();
export type NativeRules=z.infer<typeof nativeDispatchRulesSchema>;
export type Position={latitude:number;longitude:number};
export type Driver=Position&{id:string;zoneId:string|null;enteredAt:number;queuedAt:number;gpsAt:number;available:boolean;noFare:boolean;bookingId:string|null};
export type Job=Position&{id:string;zoneId:string|null;driverId:string|null;pob:boolean;status:'waiting'|'accepted'|'pob'|'completed'|'cancelled'|'no_fare';eligibleDriverIds?:string[];excludedDriverIds?:string[]};
export type Offer={driverId:string;opensAt:number;expiresAt:number;status:'pending'|'rejected'|'accepted'|'closed'|'expired'};
export type Round={jobId:string;method:NativeRules['method'];reason:string;offers:Offer[]};
export type NativeState={drivers:Driver[];jobs:Job[];rounds:Round[];eventIds:string[];cashEnabled:boolean};
export type Zone={id:string;geometry:{type:'Polygon';coordinates:number[][][]}};
export function pointInZone(point:Position,zone:Zone){
 const ring=zone.geometry.coordinates[0];let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [x,y]=ring[i],[a,b]=ring[j],cross=(point.longitude-x)*(b-y)-(point.latitude-y)*(a-x);
  if(Math.abs(cross)<1e-12&&point.longitude>=Math.min(x,a)&&point.longitude<=Math.max(x,a)&&point.latitude>=Math.min(y,b)&&point.latitude<=Math.max(y,b))return true;
  if((y>point.latitude)!==(b>point.latitude)&&point.longitude<(a-x)*(point.latitude-y)/(b-y)+x)inside=!inside;
 }return inside;
}
export function locateZone(point:Position,zones:Zone[]){const matches=zones.filter(zone=>pointInZone(point,zone));if(matches.length>1)throw Error('Overlapping live zones require explicit resolution.');return matches[0]?.id??null}
export function effectiveNativeRules(input:unknown,cashEnabled:boolean){const rules=nativeDispatchRulesSchema.parse(input??{});return {...rules,noFarePriority:cashEnabled&&rules.noFarePriority}}
export function chooseMethod(rules:NativeRules,metrics:{free_drivers:number;pending_bookings:number}){
 if(rules.control==='automatic')for(const [i,rule] of rules.automaticRules.entries())if(rule.operator==='gte'?metrics[rule.metric]>=rule.threshold:metrics[rule.metric]<rule.threshold)return{method:rule.method,reason:`Automatic rule ${i+1}: ${rule.metric} ${rule.operator} ${rule.threshold}`};
 return{method:rules.method,reason:rules.control==='manual'?'Operator-selected method':'Automatic rules: no match; configured fallback method'};
}
function eligible(driver:Driver,job:Job,rules:NativeRules,now:number){return !job.excludedDriverIds?.includes(driver.id)&&driver.available&&!driver.bookingId&&driver.gpsAt<=now+30000&&now-driver.gpsAt<=rules.gpsFreshnessSeconds*1000&&(!job.eligibleDriverIds||job.eligibleDriverIds.includes(driver.id))&&milesBetween(driver,job)<=rules.maximumRadiusMiles}
export function rankDrivers(state:NativeState,job:Job,rules:NativeRules,now:number,method:NativeRules['method']){
 const cars=state.drivers.filter(driver=>eligible(driver,job,rules,now)&&(method!=='zone_queue'||Boolean(job.zoneId)&&driver.zoneId===job.zoneId));
 const priority=(driver:Driver)=>{if(!state.cashEnabled||!rules.noFarePriority||!driver.noFare)return false;if(method==='zone_queue')return true;const nearest=state.jobs.filter(j=>j.status==='waiting'&&eligible(driver,j,rules,now)).sort((a,b)=>milesBetween(driver,a)-milesBetween(driver,b)||a.id.localeCompare(b.id))[0];return nearest?.id===job.id};
 return cars.sort((a,b)=>Number(priority(b))-Number(priority(a))||(method==='zone_queue'?(priority(a)?a.enteredAt-b.enteredAt:a.queuedAt-b.queuedAt):milesBetween(a,job)-milesBetween(b,job))||a.id.localeCompare(b.id));
}
export function startRound(state:NativeState,jobId:string,rules:NativeRules,now:number){
 rules=effectiveNativeRules(rules,state.cashEnabled);
 const job=state.jobs.find(j=>j.id===jobId);if(!job||job.status!=='waiting'||job.driverId)throw Error('Booking is not awaiting dispatch.');
 if(state.rounds.some(round=>round.jobId===jobId&&round.offers.some(o=>o.status==='pending'&&o.expiresAt>now)))throw Error('An offer round is already open.');
 const selection=chooseMethod(rules,{free_drivers:state.drivers.filter(d=>eligible(d,job,rules,now)&&(job.zoneId?d.zoneId===job.zoneId:true)).length,pending_bookings:state.jobs.filter(j=>j.status==='waiting'&&j.zoneId===job.zoneId).length});
 const count=rules.progressiveOffers?rules.driverCount:1;
 const ranked=rankDrivers(state,job,rules,now,selection.method).slice(0,count);
 // Keep the configured cadence even if fewer than the configured number qualify.
 const round:Round={jobId,...selection,offers:ranked.map((driver,index)=>({driverId:driver.id,opensAt:now+index*rules.offerSeconds*1000/count,expiresAt:now+rules.offerSeconds*1000,status:'pending'}))};
 state.rounds=state.rounds.filter(r=>r.jobId!==jobId);state.rounds.push(round);return round;
}
export type NativeEvent={id:string;at:number;kind:'gps';driverId:string;position:Position;available:boolean}|{id:string;at:number;kind:'accept'|'reject';jobId:string;driverId:string}|{id:string;at:number;kind:'pob'|'completed'|'client_cancel'|'no_fare';jobId:string}|{id:string;at:number;kind:'tick'};
export function applyNativeEvent(original:NativeState,event:NativeEvent,rules:NativeRules,cashEnabled:boolean,zones:Zone[]=[]){
 if(original.eventIds.includes(event.id))return original;
 if(!Number.isFinite(event.at))throw Error('Event timestamp is required.');
 const state=structuredClone(original);state.cashEnabled=cashEnabled;if(!cashEnabled)state.drivers.forEach(d=>{d.noFare=false});
 const penalty=(driverId:string,at:number)=>{const d=state.drivers.find(d=>d.id===driverId);if(d){d.noFare=false;d.queuedAt=Math.max(at,...state.drivers.filter(other=>other.zoneId===d.zoneId).map(other=>other.queuedAt))+1}};
 // Expiration is a refusal, but only for drivers whose offer actually opened.
 for(const round of state.rounds)for(const offer of round.offers)if(offer.status==='pending'&&offer.expiresAt<=event.at){offer.status='expired';const job=state.jobs.find(j=>j.id===round.jobId);if(job)job.excludedDriverIds=[...new Set([...(job.excludedDriverIds??[]),offer.driverId])];if(offer.opensAt<offer.expiresAt)penalty(offer.driverId,offer.expiresAt)}
 if(event.kind==='gps'){
  if(!Number.isFinite(event.position.latitude)||Math.abs(event.position.latitude)>85||!Number.isFinite(event.position.longitude)||Math.abs(event.position.longitude)>180)throw Error('Invalid driver position.');
  let driver=state.drivers.find(d=>d.id===event.driverId);if(driver&&event.at<=driver.gpsAt){state.eventIds.push(event.id);return state;}
  const zoneId=locateZone(event.position,zones);
  if(!driver){driver={id:event.driverId,...event.position,zoneId,enteredAt:event.at,queuedAt:event.at,gpsAt:event.at,available:event.available,noFare:false,bookingId:null};state.drivers.push(driver)}else{
   if(driver.zoneId!==zoneId||(!driver.available&&event.available&&!driver.bookingId)){driver.enteredAt=event.at;driver.queuedAt=event.at}
   Object.assign(driver,event.position,{zoneId,gpsAt:event.at,available:event.available&&!driver.bookingId});
  }
 }else if(event.kind==='accept'||event.kind==='reject'){
  const job=state.jobs.find(j=>j.id===event.jobId),round=state.rounds.find(r=>r.jobId===event.jobId),offer=round?.offers.find(o=>o.driverId===event.driverId),driver=state.drivers.find(d=>d.id===event.driverId);
  if(!job||job.status!=='waiting'||!offer||offer.status!=='pending'||event.at<offer.opensAt||event.at>=offer.expiresAt||!driver)throw Error('Offer is no longer available.');
  if(event.kind==='reject'){offer.status='rejected';job.excludedDriverIds=[...new Set([...(job.excludedDriverIds??[]),driver.id])];penalty(driver.id,event.at);if(round&&!round.offers.some(o=>o.status==='pending'&&o.opensAt<=event.at)){const next=round.offers.filter(o=>o.status==='pending').sort((a,b)=>a.opensAt-b.opensAt)[0];if(next)next.opensAt=event.at}}else{
   if(!eligible(driver,job,rules,event.at)||(round?.method==='zone_queue'&&driver.zoneId!==job.zoneId))throw Error('Driver is no longer eligible.');
   job.driverId=driver.id;job.status='accepted';driver.bookingId=job.id;driver.available=false;driver.noFare=false;
   for(const r of state.rounds)for(const o of r.offers)if(o.status==='pending'&&(r.jobId===job.id||o.driverId===driver.id))o.status=r.jobId===job.id&&o.driverId===driver.id?'accepted':'closed';
  }
 }else if(event.kind!=='tick'){
  const job=state.jobs.find(j=>j.id===event.jobId);if(!job||!job.driverId||!['accepted','pob'].includes(job.status))throw Error('Booking has no active assignment.');
  const driver=state.drivers.find(d=>d.id===job.driverId);if(!driver)throw Error('Assigned driver not found.');
  if(event.kind==='pob'){job.pob=true;job.status='pob';driver.noFare=false}else{
   const grant=cashEnabled&&rules.noFarePriority&&!job.pob&&(event.kind==='client_cancel'||event.kind==='no_fare');
   job.status=event.kind==='completed'?'completed':event.kind==='client_cancel'?'cancelled':'no_fare';
   driver.noFare=grant;driver.bookingId=null;driver.available=true;driver.enteredAt=event.at;driver.queuedAt=event.at;
  }
 }
 state.eventIds.push(event.id);return state;
}
