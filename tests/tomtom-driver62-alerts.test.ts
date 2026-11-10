import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDriver62Feed,tomtomAlert,tomtomDriver62Enabled,combineAlertEvents,driver62TomtomFeed} from '../lib/traffic/driver62-alerts';
import {loadAlertPlan} from '../lib/street-manager/alert-plan';
import {tomtomItem,type TrafficFeed} from '../lib/traffic/tomtom';
import {approachingClosure,type ActiveRoadEvent} from '../lib/street-manager/closure-alerts';
const now=Date.parse('2026-11-10T12:00:00Z');
const enabled={TOMTOM_DRIVER62_ALERTS_ENABLED:'true',ROAD_CLOSURE_ALERTS_MODE:'pilot',ROAD_CLOSURE_PILOT_DRIVER_ID:'1364',ROAD_CLOSURE_PILOT_CALLSIGN:'62'};
function item(category=8){return tomtomItem({geometry:{type:'LineString',coordinates:[[-4.15,50.38],[-4.15,50.39]]},properties:{id:'synthetic-incident',iconCategory:category,from:'North Rd West',to:'Test Street',timeValidity:'present',startTime:'2026-11-10T10:00:00Z',endTime:'2026-11-10T18:00:00Z',delay:180,events:[{description:'Synthetic traffic event',iconCategory:category}]}},now)!;}
function feed(at=now):TrafficFeed{return {status:'ok',checkedAt:new Date(at).toISOString(),items:[{...item(),receivedAt:new Date(at).toISOString()}],total:1,omitted:0,error:null};}
test('TomTom pilot cannot activate for a different driver, callsign, unrestricted live mode or missing flag',()=>{
 assert.equal(tomtomDriver62Enabled(enabled),true);
 for(const override of [{ROAD_CLOSURE_ALERTS_MODE:'live'},{ROAD_CLOSURE_ALERTS_MODE:'observe'},{ROAD_CLOSURE_PILOT_DRIVER_ID:'1365'},{ROAD_CLOSURE_PILOT_CALLSIGN:'64'},{TOMTOM_DRIVER62_ALERTS_ENABLED:'false'}])assert.equal(tomtomDriver62Enabled({...enabled,...override}),false);
});
test('only current, fresh, dated provider incidents with real geometry are alert eligible',()=>{
 const i=item();assert.ok(tomtomAlert(i,now));
 for(const changed of [{...i,receivedAt:new Date(now-120000).toISOString()},{...i,receivedAt:new Date(now+6000).toISOString()},{...i,source:'archive' as const},{...i,geometry:null},{...i,tomtom:{...i.tomtom!,timeValidity:'future'}},{...i,tomtom:{...i.tomtom!,startsAt:null}},{...i,tomtom:{...i.tomtom!,startsAt:'2026-11-10T13:00:00Z'}},{...i,tomtom:{...i.tomtom!,endsAt:'2026-11-10T12:00:00Z'}}])assert.equal(tomtomAlert(changed,now),null);
 const ongoing=tomtomAlert({...i,tomtom:{...i.tomtom!,endsAt:null}},now)!;assert.equal(ongoing.endsAt,now+120000);
});
test('alerts distinguish closures, lane closures, works, accidents and congestion and cap message length',()=>{
 for(const [category,kind,label] of [[8,'closure','road closure'],[7,'restriction','lane closure'],[9,'roadworks','roadworks'],[1,'incident','accident'],[6,'congestion','congestion']] as const){const event=tomtomAlert(item(category),now)!;assert.equal(event.kind,kind);assert.ok(event.message?.includes(label));assert.ok(event.message!.length<=185);}
 assert.match(tomtomAlert(item(6),now)!.message!,/Delay ~3 min/);
 const long=item();long.details=long.details.map(d=>d.label==='From'?{...d,value:'x'.repeat(3000)}:d);assert.ok(tomtomAlert(long,now)!.message!.length<=185);
 const mixed=item(9);mixed.tomtom!.categories.push(8);assert.equal(tomtomAlert(mixed,now)?.kind,'closure');
});
test('provider refresh is capped, inactive GPS clears incidents, and expired or failed data cannot alert',async()=>{
 let calls=0,clock=now,fail=false;
 const reader=createDriver62Feed(async()=>{calls++;return fail?{...feed(clock),status:'unavailable',items:[],retryAfterSeconds:300,error:'Provider limit'}:feed(clock);},()=>enabled);
 assert.equal((await reader.read(false,now,true)).status.status,'idle');assert.equal(calls,0);
 assert.equal((await reader.read(true,now,true)).events.length,1);assert.equal(calls,1);
 await reader.read(true,now+10000,true);assert.equal(calls,1);
 assert.equal((await reader.read(true,now+120000)).events.length,0);
 fail=true;clock=now+120000;const failed=await reader.read(true,clock,true);assert.equal(failed.events.length,0);assert.equal(failed.status.status,'unavailable');assert.equal(calls,2);
 clock=now+240000;await reader.read(true,clock,true);assert.equal(calls,2,'Retry-After is respected');
 fail=false;clock=now+420000;assert.equal((await reader.read(true,clock,true)).events.length,1);assert.equal(calls,3);
 assert.equal((await reader.read(false,clock+1)).events.length,0);
 const disabled=createDriver62Feed(async()=>{throw Error('must not fetch')},()=>({...enabled,ROAD_CLOSURE_ALERTS_MODE:'live'}));assert.equal((await disabled.read(true,now,true)).status.status,'disabled');
});
test('overlapping Street Manager reports use a common daily key; a later closure remains distinct from works',()=>{
 const event=tomtomAlert(item(),now)!,street:ActiveRoadEvent={...event,key:'SYNTHETIC-USRN',street:'NORTH ROAD WEST',source:'street-manager',message:undefined};
 assert.equal(combineAlertEvents([street],[event]).length,1);
 const works={...street,kind:'roadworks' as const};const combined=combineAlertEvents([works],[event]);assert.equal(combined.length,2);assert.equal(combined[1].key,works.key);
 const shifted={...event,geometry:{type:'LineString' as const,coordinates:[[-4.2,50.38],[-4.2,50.39]]}};assert.equal(combineAlertEvents([street],[shifted]).length,2);
 const duplicate={...event,key:'TOMTOM:another-direction'};assert.equal(combineAlertEvents([],[event,duplicate]).length,1);
 const current={driverId:'1364',vehicleId:'1530',latitude:50.385,longitude:-4.151,at:now-1000},previous={...current,longitude:-4.152,at:now-11000};
 const candidate=approachingClosure(current,previous,combined[1],now)!;assert.equal(candidate.source,'tomtom');assert.equal(candidate.closureKey,'SYNTHETIC-USRN');assert.match(candidate.message,/TomTom reports/);
});
test('combined planner only creates TomTom candidates for the exact driver-62 identity',async()=>{
 const original=driver62TomtomFeed.read;const event=tomtomAlert(item(),now)!;
 driver62TomtomFeed.read=async()=>({events:[event],status:{enabled:true,status:'ok',checkedAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString(),nextAttemptAt:null,events:1,error:null}});
 try{
  const tracks=[['1364','62'],['1365','64'],['1364','64']].map(([driver_id,driver_callsign],i)=>({driver_id,driver_callsign,vehicle_id:String(1530+i),latitude:50.385,longitude:-4.151,recorded_at:new Date(now-1000),previous_latitude:50.385,previous_longitude:-4.152,previous_at:new Date(now-11000)}));
  const client={query:async(sql:string)=>({rows:sql.includes('FROM street_manager_events')?[]:tracks})} as unknown as Parameters<typeof loadAlertPlan>[0];
  const plan=await loadAlertPlan(client,now);assert.equal(plan.candidates.length,1);assert.equal(plan.candidates[0].driverId,'1364');assert.equal(plan.candidates[0].vehicleId,'1530');assert.equal(plan.candidates[0].source,'tomtom');assert.equal(plan.tomtom?.status,'ok');
 }finally{driver62TomtomFeed.read=original;}
});
