import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {activeClosure,approachingClosure,distanceToClosure,alertDay,type ActiveClosure,type DriverFix} from '../lib/street-manager/closure-alerts';
import {claimDriverAlert} from '../lib/street-manager/alert-delivery';
import {driverMessageBody,driverMessageUrl} from '../lib/street-manager/driver-message';
import type {PreviewRow} from '../lib/street-manager/preview-data';
import {POST} from '../app/api/internal/street-manager/driver-alerts/route';
const now=Date.parse('2026-11-09T12:00:00Z');
const data={highway_authority_swa_code:'1160',street_name:'NORTH RD WEST',usrn:'SYNTHETIC-USRN',work_status_ref:'in_progress',permit_status:'granted',traffic_management_type_ref:'road_closure',actual_start_date_time:'2026-11-09T10:00:00Z',proposed_end_date:'2026-11-09T00:00:00Z',works_location_coordinates:'POINT(248000 55000)'};
const row:PreviewRow={object_type:'PERMIT',object_reference:'SYNTHETIC',event_type:'WORK_START',event_time:'2026-11-09T10:01:00Z',received_at:'2026-11-09T10:02:00Z',event_data:{object_data:data}};
function changed(changes:Record<string,unknown>,extra:Partial<PreviewRow>={}){return {...row,...extra,event_data:{object_data:{...data,...changes}}}}
test('only currently reported Plymouth closures qualify; planned, ended, reverts and Section 58 do not',()=>{
 assert.ok(activeClosure(row,now));
 for(const r of [changed({highway_authority_swa_code:'1100'}),changed({}, {object_type:'SECTION_58'}),changed({}, {event_type:'WORK_STOP'}),changed({}, {event_type:'WORK_STOP_REVERTED'}),changed({}, {same_time_versions:2}),changed({work_status_ref:'planned'}, {event_type:'PERMIT_GRANTED'}),changed({actual_end_date_time:'2026-11-09T11:00:00Z'}),changed({current_traffic_management_type_ref:'no_carriageway_incursion'}),changed({traffic_management_type_ref:'lane_closure'}),changed({permit_status:'cancelled'}),changed({proposed_end_time:'2026-11-09T11:59:59Z'}),changed({proposed_start_time:'2026-11-09T13:00:00Z'}),changed({proposed_end_date:null}),changed({works_location_coordinates:'invalid'})])assert.equal(activeClosure(r,now),null,JSON.stringify(r));
 const c=activeClosure(changed({proposed_end_time:'2026-11-09T12:00:00Z'}),now);assert.equal(c,null);
});
test('London date-only end is calendar-inclusive across BST; missing activity clocks are not invented',()=>{
 const summer=changed({actual_start_date_time:'2026-07-01T10:00:00Z',proposed_end_date:'2026-07-01T00:00:00Z'},{event_time:'2026-07-01T10:00:00Z'});
 assert.ok(activeClosure(summer,Date.parse('2026-07-01T22:59:59Z')));assert.equal(activeClosure(summer,Date.parse('2026-07-01T23:00:00Z')),null);
 assert.equal(alertDay(Date.parse('2026-07-01T23:30:00Z')),'2026-07-02');
 const activity=changed({start_time:null,end_time:null},{object_type:'ACTIVITY',event_type:'ACTIVITY_UPDATED'});assert.equal(activeClosure(activity,now),null);
 assert.ok(activeClosure(changed({start_time:'2026-11-09T11:00:00Z',end_time:'2026-11-09T13:00:00Z'},{object_type:'ACTIVITY',event_type:'ACTIVITY_UPDATED'}),now));
});
const closure:ActiveClosure={key:'SYNTHETIC',street:'NORTH RD WEST',geometry:{type:'LineString',coordinates:[[-4.14,50.36],[-4.14,50.38]]},startsAt:now-3600000,endsAt:now+3600000,reportedOnly:true};
const current:DriverFix={driverId:'123',vehicleId:'456',latitude:50.37,longitude:-4.142,at:now-1000};
const previous:DriverFix={...current,longitude:-4.146,at:now-21000};
test('proximity follows segments and polygon holes, not centroids',()=>{
 const d=distanceToClosure(current.latitude,current.longitude,closure.geometry);assert.ok(d>130&&d<150);
 assert.ok(distanceToClosure(50.3601,-4.1401,closure.geometry)<10);
 const polygon={type:'Polygon' as const,coordinates:[[[-4.15,50.36],[-4.13,50.36],[-4.13,50.38],[-4.15,50.38],[-4.15,50.36]],[[-4.141,50.369],[-4.139,50.369],[-4.139,50.371],[-4.141,50.371],[-4.141,50.369]]]};
 assert.equal(distanceToClosure(50.375,-4.14,polygon),0);assert.ok(distanceToClosure(50.37,-4.14,polygon)>60);
});
test('fresh approach produces a concise driver-targeted warning; noise, stale/mismatched fixes and retreat do not',()=>{
 const candidate=approachingClosure(current,previous,closure,now)!;assert.ok(candidate);assert.equal(candidate.message,'North Rd West is reported closed nearby.');assert.equal(candidate.driverId,'123');
 for(const [a,b] of [[{...current,at:now-100000},previous],[current,{...previous,vehicleId:'other'}],[current,{...previous,driverId:'other'}],[{...current,driverId:'vehicle:456'},previous],[current,current],[current,{...previous,longitude:-4.141}],[{...current,at:now+6000},previous],[{...current,longitude:NaN},previous],[{...current,longitude:-4.15},previous],[current,{...previous,longitude:4.14}]])assert.equal(approachingClosure(a,b,closure,now),null);
 assert.equal(approachingClosure(current,previous,{...closure,endsAt:now},now),null);
});
test('configured message template targets exactly one driver with explicit JSON types and no guessed endpoint',()=>{
 assert.deepEqual(driverMessageBody({targetIds:['{{driverId:number}}'],text:'{{message}}',kind:'notice'},'123','Example'),{targetIds:[123],text:'Example',kind:'notice'});
 for(const template of [{text:'{{message}}'},{id:'{{driverId}}',other:'{{driverId}}',text:'{{message}}'},{id:'{{driverId}}',text:'hello {{message}}'},{}])assert.throws(()=>driverMessageBody(template,'123','Example'));
 assert.throws(()=>driverMessageBody({id:'{{driverId:number}}',text:'{{message}}'},'vehicle:123','Example'));
 assert.equal(driverMessageUrl('https://example.test/api/','driver/message','POST').pathname,'/api/driver/message');
 for(const [path,method] of [['https://evil.test/message','POST'],['/message','GET'],['https://user:pass@example.test/message','POST']])assert.throws(()=>driverMessageUrl('https://example.test/',path,method));
});
test('durable reservation prevents webhook replay/daily duplicates and applies a driver-wide cooldown',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  const schema=readFileSync('scripts/migrations/20261109_road_closure_alerts.sql','utf8');await db.exec(schema);await db.exec(schema);
  const client={query:(sql:string,params:unknown[])=>db.query(sql,params)} as unknown as Parameters<typeof claimDriverAlert>[0];
  const c=approachingClosure(current,previous,closure,now)!;
  const first=await claimDriverAlert(client,c,now);assert.ok(first);
  assert.equal(await claimDriverAlert(client,c,now),null);
  assert.equal(await claimDriverAlert(client,{...c,closureKey:'different'},now+10000),null);
  assert.equal(await claimDriverAlert(client,c,now+130000),null);
  // Daily duplicate rolls back the clock update, allowing a different closure.
  assert.ok(await claimDriverAlert(client,{...c,closureKey:'different'},now+130000));
  assert.ok(await claimDriverAlert(client,{...c,driverId:'other'},now));
  const rows=(await db.query<{status:string;count:number}>('SELECT status,count(*)::int AS count FROM street_manager_driver_alerts GROUP BY status')).rows;assert.deepEqual(rows,[{status:'SENDING',count:3}]);
 }finally{await db.close()}
});
test('alert worker rejects anonymous calls and stays off without explicit mode',async()=>{
 const oldSecret=process.env.BOOKING_WRITER_JOB_SECRET,oldMode=process.env.ROAD_CLOSURE_ALERTS_MODE;
 try{process.env.BOOKING_WRITER_JOB_SECRET='synthetic-secret';delete process.env.ROAD_CLOSURE_ALERTS_MODE;
 assert.equal((await POST(new Request('https://example.test',{method:'POST'}))).status,401);
 const r=await POST(new Request('https://example.test',{method:'POST',headers:{'x-booking-writer-secret':'synthetic-secret'}}));assert.deepEqual(await r.json(),{mode:'off',attempted:0});
 }finally{if(oldSecret===undefined)delete process.env.BOOKING_WRITER_JOB_SECRET;else process.env.BOOKING_WRITER_JOB_SECRET=oldSecret;if(oldMode===undefined)delete process.env.ROAD_CLOSURE_ALERTS_MODE;else process.env.ROAD_CLOSURE_ALERTS_MODE=oldMode}
});
test('plan uses committed webhook GPS and current shift identity; newer cancellation suppresses an older permit for the same work',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {loadAlertPlan}=await import('../lib/street-manager/alert-plan');const db=new PGlite();
 try{
  await db.exec(readFileSync('scripts/migrations/20261108_street_manager_inbox.sql','utf8'));
  await db.exec(`CREATE TABLE "Driver"(id text,"externalId" text,active boolean,suspended boolean,archived boolean);
   CREATE TABLE "Vehicle"(id text,provider text,"externalId" text,"currentDriverId" text,"currentStatus" text,"currentBookingId" int,"lastSeenAt" timestamptz,"isActive" boolean,"isSuspended" boolean);
   CREATE TABLE "DriverShift"(id text,provider text,"driverId" text,"vehicleId" text,status text,"startedAt" timestamptz,"endedAt" timestamptz,"modifiedAt" timestamptz);
   CREATE TABLE "Booking"(id text,provider text,"externalId" text,"driverId" text,"vehicleId" text,status text,"dispatchedAt" timestamptz,"acceptedAt" timestamptz,"arrivedAt" timestamptz,"pickedUpAt" timestamptz,"completedAt" timestamptz,"cancelledAt" timestamptz,"noFareAt" timestamptz);
   CREATE TABLE driver_positions(driver_id text,vehicle_id text,latitude double precision,longitude double precision,recorded_at timestamptz,received_at timestamptz DEFAULT now());
   INSERT INTO "Driver" VALUES('d1','123',true,false,false);
   INSERT INTO "Vehicle" VALUES('v1','AUTOCAB','456','d1','Clear',NULL,now(),true,false);`);
  const clock=Date.now(),at=new Date(clock-1000),before=new Date(clock-21000);
  const source={...data,work_reference_number:'WORK-ONE',actual_start_date_time:new Date(clock-3600000).toISOString(),proposed_end_time:new Date(clock+3600000).toISOString()};
  const rowInsert=`INSERT INTO street_manager_events(topic_arn,message_id,event_reference,event_type,object_type,object_reference,event_time,sns_timestamp,schema_version,event_data) VALUES('synthetic',$1,$1,$2,'PERMIT',$3,$4,$4,1,$5)`;
  await db.query(rowInsert,['one','WORK_START','permit-one',new Date(clock-3500000),JSON.stringify({object_data:source})]);
  await db.query('UPDATE "Vehicle" SET "lastSeenAt"=$1',[at]);
  const actual=activeClosure({...row,event_time:new Date(clock-3500000),event_data:{object_data:source}},clock)!;
  if(actual.geometry.type!=='Point')throw Error('Expected point');const [lng,lat]=actual.geometry.coordinates;
  await db.query('INSERT INTO driver_positions(driver_id,vehicle_id,latitude,longitude,recorded_at) VALUES($1,$2,$3,$4,$5),($1,$2,$3,$6,$7)',['123','456',lat,lng-.002,at,lng-.006,before]);
  const client={query:(sql:string,params:unknown[])=>db.query(sql,params)} as unknown as Parameters<typeof loadAlertPlan>[0];
  assert.equal((await loadAlertPlan(client,clock)).candidates.length,0,'GPS cannot open a shift');
  await db.exec(`INSERT INTO "DriverShift" VALUES('s1','AUTOCAB','d1','v1','ACTIVE',now()-interval '1 hour',NULL,NULL)`);
  const plan=await loadAlertPlan(client,clock);assert.equal(plan.activeClosures,1);assert.equal(plan.candidates.length,1);
  await db.exec('UPDATE "Driver" SET suspended=true');assert.equal((await loadAlertPlan(client,clock)).candidates.length,0);
  await db.exec('UPDATE "Driver" SET suspended=false');
  await db.query(rowInsert,['two','PERMIT_CANCELLED','permit-two',new Date(clock-10000),JSON.stringify({object_data:{...source,permit_status:'cancelled'}})]);
  const cancelled=await loadAlertPlan(client,clock);assert.equal(cancelled.activeClosures,0);assert.equal(cancelled.candidates.length,0);
 }finally{await db.close()}
});
