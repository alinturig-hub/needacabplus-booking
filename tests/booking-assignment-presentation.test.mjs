import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {bookingAssignmentPresentation,bookingAssignmentsSql} from '../lib/booking-assignment-presentation.mjs';

test('uses booking snapshots before current registry and separates call signs from names and registration',()=>{
 const result=bookingAssignmentPresentation({
  driver_snapshot:{id:'1025',callsign:'11',forename:'Original',surname:'Driver',badgeNumber:'BADGE-123'},
  driver_registry:{fullName:'Different Name',mobile:'07000000000',badgeNumber:'NEW-BADGE'},
  vehicle_snapshot:{id:'1022',callsign:'11',registration:'OLD REG'},
  vehicle_payload:{Id:1022,Make:'Snapshot make',Model:'Snapshot model',Colour:'Blue'},
  vehicle_registry:{make:'Different make',model:'Different model',registration:'NEW REG',plateNumber:'PLATE-1'},
 });
 assert.equal(result.driver_data.name,'Original Driver');
 assert.equal(result.driver_data.callsign,'11');
 assert.equal(result.driver_data.phone,'07000000000');
 assert.equal(result.driver_data.badgeNumber,'BADGE-123');
 assert.deepEqual(result.driver_data.registryFields,['phone']);
 assert.equal(result.vehicle_data.registration,'OLD REG');
 assert.equal(result.vehicle_data.make,'Snapshot make');
 assert.deepEqual(result.vehicle_data.registryFields,['plateNumber']);
 assert.equal(result.driver_data.eta,null);
});
test('call signs never masquerade as driver name, badge, registration or plate',()=>{
 const r=bookingAssignmentPresentation({driver_snapshot:{callsign:'11'},vehicle_snapshot:{callsign:'11'}});
 assert.equal(r.driver_data.name,null);assert.equal(r.driver_data.badgeNumber,null);
 assert.equal(r.vehicle_data.registration,null);assert.equal(r.vehicle_data.plateNumber,null);
});
test('unassigned bookings do not resurrect stale raw assignments or registry data',()=>{
 const r=bookingAssignmentPresentation({driver_snapshot:{},driver_payload:{Id:1,Name:'Old driver'},driver_registry:{fullName:'Old driver'},vehicle_snapshot:{},vehicle_payload:{Id:1,Registration:'OLD REG'}});
 assert.equal(r.driver_data,null);assert.equal(r.vehicle_data,null);
});
test('payload from another assignment is ignored',()=>{
 const r=bookingAssignmentPresentation({driver_snapshot:{id:'new'},driver_payload:{Id:'old',Name:'Old driver'},vehicle_snapshot:{id:'new-car'},vehicle_payload:{Id:'old-car',Registration:'OLD REG'}});
 assert.equal(r.driver_data.name,null);assert.equal(r.vehicle_data.registration,null);
});
test('batched SQL matches saved IDs within the provider, never reused call signs',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Booking" (id text,provider text,"driverId" text,"driverCallSign" text,"driverForename" text,"driverSurname" text,"driverBadgeNumber" text,"vehicleId" text,"vehicleCallSign" text,"vehicleRegistration" text,"vehiclePlateNumber" text,"rawPayload" jsonb);
   CREATE TABLE "Driver" (id text,provider text,"externalId" text,"fullName" text,forename text,surname text,mobile text,telephone text,"badgeNumber" text);
   CREATE TABLE "Vehicle" (id text,provider text,"externalId" text,make text,model text,colour text,registration text,"plateNumber" text);
   INSERT INTO "Booking" VALUES ('test-booking','AUTOCAB','1025','11','Saved','Driver','B1','1022','11','SAVED REG',NULL,'{}');
   INSERT INTO "Driver" VALUES ('driver-key','AUTOCAB','1025','Current Driver',NULL,NULL,'07000000000',NULL,'B2'),('wrong-provider','OTHER','1025','Wrong provider',NULL,NULL,'wrong',NULL,'wrong');
   INSERT INTO "Vehicle" VALUES ('car-key','AUTOCAB','1022','Correct make','Correct model','Blue','CURRENT REG','P1'),('wrong-car','OTHER','1022','Wrong make',NULL,NULL,'WRONG REG',NULL);`);
  const rows=(await db.query(bookingAssignmentsSql,[['test-booking']])).rows;
  assert.equal(rows.length,1);
  const r=bookingAssignmentPresentation(rows[0]);
  assert.equal(r.driver_data.name,'Saved Driver');assert.equal(r.driver_data.phone,'07000000000');
  assert.equal(r.vehicle_data.make,'Correct make');assert.equal(r.vehicle_data.registration,'SAVED REG');
  assert.equal((await db.query(bookingAssignmentsSql,[['missing-booking']])).rows.length,0);
 }finally{await db.close()}
});
