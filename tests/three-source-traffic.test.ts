import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {councilActiveWindow,councilAlert,councilFallbacks,councilDriver62Enabled,loadCouncilAlerts,type CouncilAlertRow} from '../lib/traffic/council-alerts';
import {mergeTrafficReports,reportsMatch,londonDateWindow} from '../lib/traffic/correlation';
import {tomtomItem} from '../lib/traffic/tomtom';
import {correlatedAlertKeys,tomtomAlert} from '../lib/traffic/driver62-alerts';
import {councilPreviewItem} from '../lib/street-manager/supplementary-view';
import {locateCouncilNotices,councilExtentNames} from '../lib/street-manager/council-location';
import {approachingClosure} from '../lib/street-manager/closure-alerts';
import {claimDriverAlert,rememberDriverAlertAlias} from '../lib/street-manager/alert-delivery';
import {visibleTraffic} from '../lib/traffic/presentation';
const now=Date.parse('2026-11-10T12:00:00Z');
function council():CouncilAlertRow{return {id:'synthetic-council',notice_data:{id:'synthetic-council',street:'North Rd West',startDate:'2026-11-10',endDate:'2026-11-12',dateText:'10 November to 12 November 2026',traffic:'Road closure, at junction with Test Street, 9am to 3pm',description:'Synthetic works',contractor:null,sourceUrl:'https://www.plymouth.gov.uk/roadworks#synthetic',anchor:'synthetic',contentHash:'synthetic'},geometry:{type:'Point',coordinates:[-4.15,50.38]},location_quality:'verified',location_basis:'junction',source_checked_at:new Date(now).toISOString()};}
function tomtom(){return tomtomItem({geometry:{type:'Point',coordinates:[-4.15,50.38]},properties:{id:'synthetic-tomtom',iconCategory:8,from:'North Road West',to:'Test Street',timeValidity:'present',startTime:'2026-11-10T10:00:00Z',endTime:'2026-11-12T18:00:00Z',events:[{description:'Closed',iconCategory:8}]}},now)!;}
function street(){const t=tomtom();return {...t,id:'PERMIT:synthetic',reference:'synthetic-street',source:'webhook' as const,type:'PERMIT',street:'North Road West',tomtom:undefined,details:[{label:'Actual start',value:'2026-11-10T10:00:00Z',format:'datetime' as const},{label:'Proposed end time',value:'2026-11-12T18:00:00Z',format:'datetime' as const}]};}
test('three related current reports form one map event with provenance and all source filters',()=>{
 const row=council(),items=[street(),tomtom(),councilPreviewItem(row,now)],merged=mergeTrafficReports(items);
 assert.equal(merged.length,1);assert.equal(merged[0].relatedReports?.length,3);
 for(const source of ['street','tomtom','council'])assert.equal(visibleTraffic(merged,source,'all','all','').length,1);
 assert.ok(merged[0].details.some(d=>d.label.startsWith('Plymouth Council')));
 const ended={...street(),state:'ended' as const};assert.equal(mergeTrafficReports([ended,councilPreviewItem(row,now)])[0].state,'unknown');
});
test('different roads, areas, periods, archives, stale records and ambiguous matches are not silently merged',()=>{
 const a=street(),b=tomtom();assert.equal(reportsMatch(a,{...b,street:'A different road'}),false);assert.equal(reportsMatch(a,{...b,geometry:{type:'Point',coordinates:[-4.20,50.38]}}),false);assert.equal(reportsMatch(a,{...b,tomtom:{...b.tomtom!,startsAt:'2027-01-01T10:00:00Z',endsAt:'2027-01-02T10:00:00Z'}}),false);assert.equal(reportsMatch(a,{...b,source:'archive'}),false);assert.equal(reportsMatch(a,{...b,sourceStale:true}),false);
 assert.equal(mergeTrafficReports([a,{...a,id:'second-permit'},councilPreviewItem(council(),now)]).length,3);
 assert.equal(londonDateWindow('2026-02-31','2026-03-01'),null);assert.equal(londonDateWindow('2026-99-01','2026-12-01'),null);
});
test('Council alerts require explicit current hours, including overnight London/BST windows',()=>{
 const n=council().notice_data;assert.ok(councilActiveWindow(n,now));assert.equal(councilActiveWindow({...n,description:'These works have been cancelled.'},now),null);assert.equal(councilPreviewItem({...council(),notice_data:{...n,street:n.street+' (cancelled)'}},now).state,'ended');assert.equal(councilActiveWindow(n,Date.parse('2026-11-10T08:00:00Z')),null);assert.equal(councilActiveWindow(n,Date.parse('2026-11-10T15:00:00Z')),null);
 for(const traffic of ['Road closure, hours TBC','Road closure, 9 to 3','Road closure, 9am to 3','Road closure, 9am to 11am and 2pm to 4pm'])assert.equal(councilActiveWindow({...n,traffic},now),null);
 assert.ok(councilActiveWindow({...n,traffic:'Road closure, 24hrs'},now));
 const night={...n,startDate:'2026-11-10',endDate:'2026-11-10',traffic:'Road closure, 7pm to 6am'};assert.ok(councilActiveWindow(night,Date.parse('2026-11-11T05:00:00Z')));assert.equal(councilActiveWindow(night,Date.parse('2026-11-11T06:00:00Z')),null);
 const summer={...n,startDate:'2026-07-01',endDate:'2026-07-01'};assert.ok(councilActiveWindow(summer,Date.parse('2026-07-01T08:30:00Z')));assert.equal(councilActiveWindow(summer,Date.parse('2026-07-01T14:00:00Z')),null);
});
test('only fresh verified junction/segment notices can form Council-only scheduled alerts',()=>{
 const row=council(),event=councilAlert(row,now)!;assert.ok(event);assert.match(event.message!,/Council notice: a scheduled road closure/);assert.ok(event.message!.length<=185);
 for(const changed of [{...row,location_quality:'approximate' as const},{...row,location_basis:'street'},{...row,geometry:null},{...row,source_checked_at:'invalid'},{...row,source_checked_at:'2026-11-09T00:00:00Z'}])assert.equal(councilAlert(changed,now),null);
 assert.equal(councilFallbacks([row],[street()],[],now).events.length,0);assert.equal(councilFallbacks([row],[tomtom()],[],now).matched,1);assert.equal(councilFallbacks([row],[],[],now).events.length,1);
 const completed={...street(),state:'ended' as const,details:[{label:'Actual start',value:'2026-11-10T09:00:00Z'},{label:'Actual end',value:'2026-11-10T11:00:00Z'}]};assert.equal(councilFallbacks([row],[completed],[],now).events.length,0);
});
test('only uniquely identified reported junctions and unambiguous between-junction paths are verified',()=>{
 const notice=council().notice_data;
 const payload={elements:[{type:'way',id:1,tags:{name:'North Rd West'},nodes:[1,2,3],geometry:[{lat:50.38,lon:-4.15},{lat:50.381,lon:-4.15},{lat:50.382,lon:-4.15}]},{type:'way',id:2,tags:{name:'Test Street'},nodes:[1,4],geometry:[{lat:50.38,lon:-4.15},{lat:50.38,lon:-4.16}]},{type:'way',id:3,tags:{name:'End Street'},nodes:[3,5],geometry:[{lat:50.382,lon:-4.15},{lat:50.382,lon:-4.16}]}]};
 assert.equal(locateCouncilNotices([notice],payload)[notice.id].quality,'verified');
 const segment={...notice,traffic:'Road closure, between Test Street and End Street, 24hrs'};const located=locateCouncilNotices([segment],payload)[notice.id];assert.equal(located.quality,'verified');assert.equal(located.basis,'segment');assert.equal(located.geometry.type,'LineString');
 const loop={elements:[...payload.elements,{type:'way',id:99,tags:{name:'North Rd West'},nodes:[1,6,7,8,3],geometry:[{lat:50.38,lon:-4.15},{lat:50.38,lon:-4.149},{lat:50.381,lon:-4.149},{lat:50.382,lon:-4.149},{lat:50.382,lon:-4.15}]}]};assert.equal(locateCouncilNotices([segment],loop)[notice.id].quality,'approximate');
 assert.equal(locateCouncilNotices([{...notice,traffic:'Works somewhere on the road'}],payload)[notice.id].quality,'approximate');assert.deepEqual(councilExtentNames('from number 10 to 12, 24hrs'),[]);
});
test('Council fallback fails closed on source failure or missing TomTom comparison and remains driver-62 only',async()=>{
 const old=process.env.COUNCIL_DRIVER62_ALERTS_ENABLED,mode=process.env.ROAD_CLOSURE_ALERTS_MODE,driver=process.env.ROAD_CLOSURE_PILOT_DRIVER_ID,call=process.env.ROAD_CLOSURE_PILOT_CALLSIGN;
 Object.assign(process.env,{COUNCIL_DRIVER62_ALERTS_ENABLED:'true',ROAD_CLOSURE_ALERTS_MODE:'pilot',ROAD_CLOSURE_PILOT_DRIVER_ID:'1364',ROAD_CLOSURE_PILOT_CALLSIGN:'62'});
 try{
  assert.equal(councilDriver62Enabled(),true);assert.equal(councilDriver62Enabled({...process.env,ROAD_CLOSURE_ALERTS_MODE:'live'}),false);
  let status='error';const client={query:async(sql:string)=>({rows:sql.includes('to_regclass')?[{ready:true}]:sql.includes('source_runs')?[{status,checked_at:new Date(now),last_success_at:new Date(now),item_count:1}]:[council()]})} as unknown as Parameters<typeof loadCouncilAlerts>[0];
  assert.equal((await loadCouncilAlerts(client,true,true,[],[],now)).status.status,'stale');status='ok';assert.equal((await loadCouncilAlerts(client,true,false,[],[],now)).status.status,'awaiting_tomtom');assert.equal((await loadCouncilAlerts(client,true,true,[],[],now)).events.length,1);assert.equal((await loadCouncilAlerts(client,false,true,[],[],now)).events.length,0);
 }finally{for(const [key,value] of Object.entries({COUNCIL_DRIVER62_ALERTS_ENABLED:old,ROAD_CLOSURE_ALERTS_MODE:mode,ROAD_CLOSURE_PILOT_DRIVER_ID:driver,ROAD_CLOSURE_PILOT_CALLSIGN:call})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('provider identity changes suppress an extra message and remember the shared road key without extending cooldown',async()=>{
 const db=new PGlite();try{
  await db.exec(readFileSync('scripts/migrations/20261109_road_closure_alerts.sql','utf8'));
  const client={query:(sql:string,args?:unknown[])=>db.query(sql,args)} as unknown as Parameters<typeof claimDriverAlert>[0];
  const event=tomtomAlert(tomtom(),now)!,current={driverId:'1364',vehicleId:'1530',latitude:50.38,longitude:-4.151,at:now-1000},previous={...current,longitude:-4.152,at:now-11000};
  const legacy=approachingClosure(current,previous,event,now)!;assert.ok(await claimDriverAlert(client,legacy,now));
  const shared=approachingClosure(current,previous,correlatedAlertKeys([event])[0],now)!;assert.ok(shared.dedupKeys?.includes(legacy.closureKey));
  assert.equal(await claimDriverAlert(client,shared,now+121000),null);await rememberDriverAlertAlias(client,shared);
  const clock=(await db.query<{last_attempt_at:Date}>('SELECT last_attempt_at FROM street_manager_driver_alert_clock')).rows[0];assert.equal(new Date(clock.last_attempt_at).getTime(),now);
  assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM street_manager_driver_alerts WHERE outcome_code='SOURCE_DUPLICATE'")).rows[0].count,1);
  const elsewhere=correlatedAlertKeys([{...event,key:'DIFFERENT-EVENT',geometry:{type:'Point',coordinates:[-4.22,50.38]}}])[0];assert.notEqual(elsewhere.key,shared.closureKey);assert.equal(elsewhere.aliases?.includes(shared.closureKey),false);
  const laterStreet={...event,key:'SYNTHETIC-USRN',source:'street-manager' as const,street:'North Road West'};const fresh=approachingClosure(current,previous,correlatedAlertKeys([laterStreet])[0],now)!;assert.equal(fresh.closureKey,shared.closureKey);assert.equal(await claimDriverAlert(client,fresh,now+122000),null);
 }finally{await db.close();}
});
