import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {mutateTrafficBans,listTrafficBans,trafficMessageBlocked,parseBanCallsigns,BanListError} from '../lib/street-manager/message-bans';
import {deliverTrafficMessage,vehicleMessageEndpoint} from '../lib/street-manager/driver-message';
import {POST} from '../app/api/admin/street-manager/ban-list/route';
import {POST as pilotWorker} from '../app/api/internal/street-manager/driver-alerts/route';
import {trafficPilot,pilotCandidates} from '../lib/street-manager/live-scope';
async function fixture(){
 const db=new PGlite();
 await db.exec(readFileSync('scripts/migrations/20261110_traffic_message_bans.sql','utf8'));
 await db.exec(`CREATE TABLE "Driver"(id text,provider text,"externalId" text,callsign text,"fullName" text,forename text,surname text,active boolean,suspended boolean,archived boolean);
 CREATE TABLE "Vehicle"(id text,provider text,"externalId" text,callsign text,registration text,"currentDriverId" text,"lastSeenAt" timestamptz);
 CREATE TABLE "DriverShift"(provider text,"driverId" text,"vehicleId" text,status text,"startedAt" timestamptz,"endedAt" timestamptz);
 INSERT INTO "Driver" VALUES('d1','AUTOCAB','101','62','Synthetic one',NULL,NULL,true,false,false),('d2','AUTOCAB','102','64','Synthetic two',NULL,NULL,true,false,false),('old','AUTOCAB','999','62','Archived duplicate',NULL,NULL,false,false,true);
 INSERT INTO "Vehicle" VALUES('v1','AUTOCAB','201','362','TEST ONE','d1',now()),('v2','AUTOCAB','202','364','TEST TWO',NULL,now());
 INSERT INTO "DriverShift" VALUES('AUTOCAB','d2','v2','ENDED',now()-interval '1 day',now()-interval '2 hours');`);
 // PGlite has no multi-session advisory locks; the PostgreSQL lock statement is
 // recorded here while all other queries execute against the real SQL schema.
 const queries:string[]=[];
 const query=async(sql:string,params?:unknown[])=>{queries.push(sql);return sql.includes('pg_advisory_xact_lock')?{rows:[{}]}:db.query(sql,params)};
 const client={query} as unknown as Parameters<typeof mutateTrafficBans>[0];
 return {db,client,queries};
}
test('callsigns accept comma/newline batches, normalize and reject invalid or excessive input',()=>{
 assert.deepEqual(parseBanCallsigns('62, 64\n65;62'),['62','64','65']);assert.deepEqual(parseBanCallsigns('a1 A1'),['A1']);
 for(const value of ['',"62');DELETE",Array.from({length:101},(_,i)=>String(i)).join(',')])assert.throws(()=>parseBanCallsigns(value),BanListError);
});
test('add resolves active driver once, persists offline vehicle blocks and applies atomic validation',async()=>{
 const {db,client}=await fixture();try{
  const entries=await mutateTrafficBans(client,{action:'add',callsigns:'62,64'});assert.equal(entries.length,2);
  const one=entries.find(e=>e.callsign==='62')!,two=entries.find(e=>e.callsign==='64')!;
  assert.equal(one.driver_id,'101');assert.equal(one.vehicle_id,'201');assert.equal(two.association_source,'latest_shift');assert.equal(two.vehicle_id,'202');
  await db.exec('UPDATE "Vehicle" SET "currentDriverId"=NULL');assert.equal(await trafficMessageBlocked(client,'201'),true);assert.equal(await trafficMessageBlocked(client,'202'),true);
  // Snapshot stays fixed; the driver is additionally blocked in another car.
  assert.equal(await trafficMessageBlocked(client,'999','101'),true);assert.equal(await trafficMessageBlocked(client,'999','other'),false);
  await assert.rejects(mutateTrafficBans(client,{action:'add',callsigns:'65,unknown'}),/No active driver/);assert.equal((await listTrafficBans(client)).length,2);
  const audits=await db.query<{count:number}>('SELECT count(*)::int AS count FROM street_manager_message_ban_audit');assert.equal(audits.rows[0].count,2);
 }finally{await db.close()}
});
test('batch is all or nothing; ambiguous callsigns and vehicles never silently choose a recipient',async()=>{
 const {db,client}=await fixture();try{
  await assert.rejects(mutateTrafficBans(client,{action:'add',callsigns:'62,99'}));assert.equal((await listTrafficBans(client)).length,0);
  await db.exec(`UPDATE "Driver" SET active=true,archived=false WHERE id='old'`);await assert.rejects(mutateTrafficBans(client,{action:'add',callsigns:'62'}),/multiple active drivers/);
  await db.exec(`UPDATE "Driver" SET active=false,archived=true WHERE id='old';UPDATE "Vehicle" SET "currentDriverId"='d1' WHERE id='v2'`);await assert.rejects(mutateTrafficBans(client,{action:'add',callsigns:'62'}),/Multiple associated vehicles/);
 }finally{await db.close()}
});
test('edit re-resolves association, rejects stale versions, retains overlapping vehicle bans and audits removal',async()=>{
 const {db,client}=await fixture();try{
  let entries=await mutateTrafficBans(client,{action:'add',callsigns:'62'});const original=entries[0];
  await db.exec(`UPDATE "Vehicle" SET "currentDriverId"=NULL WHERE id='v1';UPDATE "Vehicle" SET "currentDriverId"='d1' WHERE id='v2'`);
  assert.equal((await listTrafficBans(client))[0].vehicle_id,'201','Mapping must not change on reads or GPS updates');
  entries=await mutateTrafficBans(client,{action:'edit',id:original.id,version:original.version,callsign:'62'});assert.equal(entries[0].vehicle_id,'202');assert.equal(entries[0].version,2);assert.equal(await trafficMessageBlocked(client,'201'),false);
  await assert.rejects(mutateTrafficBans(client,{action:'remove',id:original.id,version:1}),/changed/);
  entries=await mutateTrafficBans(client,{action:'add',callsigns:'64'});assert.equal(entries.filter(e=>e.vehicle_id==='202').length,2);
  const first=entries.find(e=>e.callsign==='62')!;entries=await mutateTrafficBans(client,{action:'remove',id:first.id,version:first.version});assert.equal(await trafficMessageBlocked(client,'202'),true);
  await mutateTrafficBans(client,{action:'remove',id:entries[0].id,version:entries[0].version});assert.equal(await trafficMessageBlocked(client,'202'),false);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM street_manager_message_ban_audit')).rows[0].count,5);
 }finally{await db.close()}
});
test('final send gate suppresses offline banned vehicles before transport; unknown DB state fails closed',async()=>{
 const {db,client,queries}=await fixture();let sends=0;const previousMode=process.env.ROAD_CLOSURE_ALERTS_MODE;process.env.ROAD_CLOSURE_ALERTS_MODE='live';
 const transport:Parameters<typeof deliverTrafficMessage>[5]=async()=>{sends++;return {status:'ACCEPTED',httpStatus:200,reason:'QUEUED_FOR_VEHICLE'}};
 try{
  await mutateTrafficBans(client,{action:'add',callsigns:'62'});await db.exec('UPDATE "Vehicle" SET "currentDriverId"=NULL');
  const connection={url:vehicleMessageEndpoint,apiKey:'SYNTHETIC_NOT_A_REAL_KEY'};
  const result=await deliverTrafficMessage(client,connection,'201','Synthetic test','101',transport);assert.equal(result.status,'SUPPRESSED');assert.equal(result.reason,'TRAFFIC_BAN_LIST');assert.equal(sends,0);
  await deliverTrafficMessage(client,connection,'999','Synthetic test','other',transport);assert.equal(sends,1);
  assert.ok(queries.some(q=>q.includes('pg_advisory_xact_lock')));
  await db.exec('DROP TABLE street_manager_message_ban_audit;DROP TABLE street_manager_message_bans');
  await assert.rejects(deliverTrafficMessage(client,connection,'999','Synthetic test','other',transport));assert.equal(sends,1,'No send when the block list cannot be read');
 }finally{if(previousMode===undefined)delete process.env.ROAD_CLOSURE_ALERTS_MODE;else process.env.ROAD_CLOSURE_ALERTS_MODE=previousMode;await db.close()}
});
test('ban mutation rejects cross-origin requests before any database access',async()=>{
 const response=await POST(new Request('https://webapp.needacabplus.app/api/admin/street-manager/ban-list',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({action:'add',callsigns:'62'})}));assert.equal(response.status,403);
});

test('pilot scope fails closed without a configured numeric driver ID and callsign, and filters every other driver',()=>{
 assert.equal(trafficPilot({ROAD_CLOSURE_ALERTS_MODE:'observe'}),null);
 for(const env of [{ROAD_CLOSURE_ALERTS_MODE:'pilot'},{ROAD_CLOSURE_ALERTS_MODE:'pilot',ROAD_CLOSURE_PILOT_DRIVER_ID:'101'},{ROAD_CLOSURE_ALERTS_MODE:'pilot',ROAD_CLOSURE_PILOT_DRIVER_ID:'not-id',ROAD_CLOSURE_PILOT_CALLSIGN:'62'}])assert.equal(trafficPilot(env)?.configured,false);
 const pilot=trafficPilot({ROAD_CLOSURE_ALERTS_MODE:'pilot',ROAD_CLOSURE_PILOT_DRIVER_ID:'101',ROAD_CLOSURE_PILOT_CALLSIGN:'62'});
 assert.deepEqual(pilotCandidates([{driverId:'101'},{driverId:'102'},{driverId:'999'}],pilot),[{driverId:'101'}]);
 assert.deepEqual(pilotCandidates([{driverId:'101'}],{configured:false,driverId:null,callsign:null}),[]);
});
test('pilot final sender requires exact driver/callsign, fresh current vehicle and an active shift; bans still win',async()=>{
 const {db,client}=await fixture();let sends=0;const keys=['ROAD_CLOSURE_ALERTS_MODE','ROAD_CLOSURE_PILOT_DRIVER_ID','ROAD_CLOSURE_PILOT_CALLSIGN'];const saved=keys.map(k=>process.env[k]);
 process.env.ROAD_CLOSURE_ALERTS_MODE='pilot';process.env.ROAD_CLOSURE_PILOT_DRIVER_ID='101';process.env.ROAD_CLOSURE_PILOT_CALLSIGN='62';
 const connection={url:vehicleMessageEndpoint,apiKey:'SYNTHETIC_NOT_A_REAL_KEY'};const transport:Parameters<typeof deliverTrafficMessage>[5]=async()=>{sends++;return {status:'ACCEPTED',httpStatus:200,reason:'QUEUED_FOR_VEHICLE'}};
 try{
  await db.exec('ALTER TABLE "Vehicle" ADD COLUMN "isActive" boolean DEFAULT true,ADD COLUMN "isSuspended" boolean DEFAULT false');
  assert.equal((await deliverTrafficMessage(client,connection,'201','Synthetic','101',transport)).reason,'OUTSIDE_LIVE_SCOPE','No active shift');
  await db.exec(`INSERT INTO "DriverShift" VALUES('AUTOCAB','d1','v1','ACTIVE',now(),NULL)`);
  assert.equal((await deliverTrafficMessage(client,connection,'201','Synthetic','101',transport)).status,'ACCEPTED');assert.equal(sends,1);
  for(const [vehicleId,driverId] of [['201','102'],['202','101'],['201',undefined]] as [string,string|undefined][])assert.equal((await deliverTrafficMessage(client,connection,vehicleId,'Synthetic',driverId,transport)).reason,'OUTSIDE_LIVE_SCOPE');
  await db.exec(`UPDATE "Driver" SET callsign='99' WHERE id='d1'`);assert.equal((await deliverTrafficMessage(client,connection,'201','Synthetic','101',transport)).reason,'OUTSIDE_LIVE_SCOPE');
  await db.exec(`UPDATE "Driver" SET callsign='62' WHERE id='d1';UPDATE "Vehicle" SET "lastSeenAt"=now()-interval '10 minutes' WHERE id='v1'`);assert.equal((await deliverTrafficMessage(client,connection,'201','Synthetic','101',transport)).reason,'OUTSIDE_LIVE_SCOPE');
  await db.exec(`UPDATE "Vehicle" SET "lastSeenAt"=now() WHERE id='v1'`);await mutateTrafficBans(client,{action:'add',callsigns:'62'});
  assert.equal((await deliverTrafficMessage(client,connection,'201','Synthetic','101',transport)).reason,'TRAFFIC_BAN_LIST');assert.equal(sends,1);
  process.env.ROAD_CLOSURE_ALERTS_MODE='observe';assert.equal((await deliverTrafficMessage(client,connection,'201','Synthetic','101',transport)).reason,'OUTSIDE_LIVE_SCOPE');assert.equal(sends,1);
 }finally{keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i]});await db.close()}
});

test('pilot worker with a missing target cannot fall back to unrestricted live sending',async()=>{
 const keys=['ROAD_CLOSURE_ALERTS_MODE','ROAD_CLOSURE_PILOT_DRIVER_ID','ROAD_CLOSURE_PILOT_CALLSIGN','BOOKING_WRITER_JOB_SECRET'];const saved=keys.map(k=>process.env[k]);
 try{
  process.env.ROAD_CLOSURE_ALERTS_MODE='pilot';delete process.env.ROAD_CLOSURE_PILOT_DRIVER_ID;delete process.env.ROAD_CLOSURE_PILOT_CALLSIGN;process.env.BOOKING_WRITER_JOB_SECRET='SYNTHETIC_JOB_SECRET';
  const response=await pilotWorker(new Request('https://app.example/api/internal/street-manager/driver-alerts',{method:'POST',headers:{'x-booking-writer-secret':'SYNTHETIC_JOB_SECRET'}}));
  assert.equal(response.status,200);const body=await response.json() as {reason:string;attempted:number};assert.equal(body.reason,'PILOT_NOT_CONFIGURED');assert.equal(body.attempted,0);
 }finally{keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i]})}
});
