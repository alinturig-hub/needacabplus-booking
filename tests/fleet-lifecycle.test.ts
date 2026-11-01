import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {fleetLifecycleJoins,fleetLiveEligibility} from '../lib/fleet-lifecycle';

test('canonical fleet lifecycle correlates shift, driver, vehicle and booking despite delayed events',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Driver"(id text,"externalId" text);
   CREATE TABLE "Vehicle"(id text,provider text,"externalId" text,"currentDriverId" text,"currentStatus" text,"currentBookingId" int,"lastSeenAt" timestamptz,"isActive" boolean,"isSuspended" boolean);
   CREATE TABLE "DriverShift"(id text,provider text,"driverId" text,"vehicleId" text,status text,"startedAt" timestamptz,"endedAt" timestamptz,"modifiedAt" timestamptz);
   CREATE TABLE "Booking"(id text,provider text,"externalId" text,"driverId" text,"vehicleId" text,status text,"dispatchedAt" timestamptz,"acceptedAt" timestamptz,"arrivedAt" timestamptz,"pickedUpAt" timestamptz,"completedAt" timestamptz,"cancelledAt" timestamptz,"noFareAt" timestamptz);
   INSERT INTO "Driver" VALUES('d1','101'),('d2','102');
   INSERT INTO "Vehicle" VALUES('v1','AUTOCAB','201','d1','Clear',NULL,now(),true,false);
  `);
  const state=async()=> (await db.query<{status:string;live:boolean}>(`SELECT fleet_state.status,(${fleetLiveEligibility} AND vehicle."lastSeenAt">=now()-interval '2 minutes') AS live FROM "Vehicle" vehicle LEFT JOIN "Driver" driver ON driver.id=vehicle."currentDriverId" ${fleetLifecycleJoins} WHERE vehicle.id='v1'`)).rows[0];
  assert.deepEqual(await state(),{status:'NotWorking',live:false},'GPS Clear alone cannot open a shift');
  await db.exec(`INSERT INTO "DriverShift" VALUES('s1','AUTOCAB','d1','v1','ACTIVE',now()-interval '1 hour',NULL,NULL)`);
  assert.deepEqual(await state(),{status:'Clear',live:true});
  await db.exec(`INSERT INTO "Booking"(id,provider,"externalId","driverId","vehicleId",status,"dispatchedAt") VALUES('b1','AUTOCAB','301','101','201','DISPATCHED',now()-interval '5 minutes'); UPDATE "Vehicle" SET "currentBookingId"=301`);
  assert.equal((await state()).status,'BusyMeterOff','dispatch overrides an older Clear GPS');
  await db.exec(`UPDATE "Booking" SET status='ARRIVED',"arrivedAt"=now()-interval '3 minutes'`);
  assert.equal((await state()).status,'Arrived');
  await db.exec(`UPDATE "Booking" SET status='POB',"pickedUpAt"=now()-interval '2 minutes'`);
  assert.equal((await state()).status,'BusyMeterOnFromClear');
  await db.exec(`UPDATE "Vehicle" SET "currentStatus"='BusyMeterOnFromClear'; UPDATE "Booking" SET status='COMPLETED',"completedAt"=now()-interval '1 minute'`);
  assert.equal((await state()).status,'Clear','completion clears that job while shift remains open');
  await db.exec(`INSERT INTO "Booking"(id,provider,"externalId","driverId","vehicleId",status,"dispatchedAt") VALUES('b2','AUTOCAB','302','101','201','ACCEPTED',now()-interval '30 seconds')`);
  assert.equal((await state()).status,'BusyMeterOff','an older completion cannot clear a new active job');
  await db.exec(`UPDATE "DriverShift" SET status='ENDED',"endedAt"=now(); UPDATE "Vehicle" SET "currentStatus"='Clear',"lastSeenAt"=now()`);
  assert.deepEqual(await state(),{status:'NotWorking',live:false},'end shift dominates late completion/GPS');
  await db.exec(`INSERT INTO "DriverShift" VALUES('s2','AUTOCAB','d1','v1','ACTIVE',now()-interval '10 seconds',NULL,NULL)`);
  assert.deepEqual(await state(),{status:'Clear',live:true},'new shift is not blocked by an old closure or old booking');
  await db.exec(`INSERT INTO "DriverShift" VALUES('s3','AUTOCAB','d1','v2','ACTIVE',now()-interval '5 seconds',NULL,NULL)`);
  assert.equal((await state()).live,false,'driver switching vehicle invalidates the old pairing');
  await db.exec(`DELETE FROM "DriverShift" WHERE id='s3'; INSERT INTO "DriverShift" VALUES('s4','AUTOCAB','d2','v1','ACTIVE',now()-interval '4 seconds',NULL,NULL)`);
  assert.equal((await state()).live,false,'vehicle switching driver invalidates the old pairing');
  await db.exec(`DELETE FROM "DriverShift" WHERE id='s4'; UPDATE "Vehicle" SET "lastSeenAt"=now()-interval '20 seconds'`);
  assert.equal((await state()).live,false,'a position from before login does not establish live availability');
  await db.exec(`UPDATE "DriverShift" SET "startedAt"=now()-interval '1 hour' WHERE id='s2'; UPDATE "Vehicle" SET "lastSeenAt"=now()-interval '10 minutes'`);
  assert.equal((await state()).live,false,'active shift alone cannot make old GPS live');
  await db.exec(`UPDATE "Vehicle" SET "lastSeenAt"=now(),"isSuspended"=true`);
  assert.equal((await state()).live,false,'suspended vehicles cannot be available');
 }finally{await db.close()}
});
