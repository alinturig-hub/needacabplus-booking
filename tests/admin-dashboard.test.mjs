import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {dashboardBookingsSql,dashboardFleetSql} from '../lib/admin-dashboard-queries.mjs';

test('today follows London pickup time and counts NAC references without counting tomorrow',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Booking" ("pickupDueTime" timestamp,"bookingSource" text,"externalId" text,"ourReference" text,status text DEFAULT 'CREATED',"paymentType" text DEFAULT 'Cash');
   INSERT INTO "Booking" ("pickupDueTime","bookingSource","externalId","ourReference") VALUES
   ('2026-10-20 22:59:59','OperatorWeb','1',NULL),
   ('2026-10-20 23:00:00','OperatorWeb','2','NAC-quote'),
   ('2026-10-21 10:00:00','WebApp','3',NULL),
   ('2026-10-21 22:59:59','MobileApp','4',NULL),
   ('2026-10-21 23:00:00','WebApp','5',NULL),
   (NULL,'WebApp','6',NULL);`);
  const row=(await db.query(dashboardBookingsSql,['2026-10-21'])).rows[0];
  assert.equal(row.total,3);assert.equal(row.webapp,2);
 }finally{await db.close()}
});
test('the clock-change day includes both repeated London hours and excludes the next midnight',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Booking" ("pickupDueTime" timestamp,"bookingSource" text,"externalId" text,"ourReference" text,status text DEFAULT 'CREATED',"paymentType" text DEFAULT 'Cash');
   INSERT INTO "Booking" ("pickupDueTime","bookingSource","externalId","ourReference") VALUES
   ('2026-10-24 23:00:00','OperatorWeb','1',NULL),
   ('2026-10-25 00:30:00','OperatorWeb','2',NULL),
   ('2026-10-25 01:30:00','OperatorWeb','3',NULL),
   ('2026-10-25 23:59:59','OperatorWeb','4',NULL),
   ('2026-10-26 00:00:00','OperatorWeb','5',NULL);`);
  const row=(await db.query(dashboardBookingsSql,['2026-10-25'])).rows[0];
  assert.equal(row.total,4);assert.equal(row.webapp,0);
 }finally{await db.close()}
});
test('online drivers use the latest fresh eligible vehicle state, exclude unknown and future data',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Vehicle" ("currentDriverId" text,"currentStatus" text,"isActive" boolean,"isSuspended" boolean,"lastSeenAt" timestamp);
   INSERT INTO "Vehicle" VALUES
   ('driver1','Clear',true,false,'2026-10-21 11:58:00'),
   ('driver1','BusyMeterOff',true,false,'2026-10-21 11:59:00'),
   ('driver2','Clear',true,false,'2026-10-21 11:59:00'),
   ('stale','Clear',true,false,'2026-10-21 11:00:00'),
   ('future','Clear',true,false,'2026-10-21 12:02:00'),
   ('inactive','Clear',false,false,'2026-10-21 11:59:00'),
   ('suspended','Clear',true,true,'2026-10-21 11:59:00'),
   ('unknown','Unknown',true,false,'2026-10-21 11:59:00'),
   ('off','NotWorking',true,false,'2026-10-21 11:59:00');`);
  assert.deepEqual((await db.query(dashboardFleetSql,['2026-10-21T12:00:00Z',10])).rows,[{online:2,free:1,busy:1}]);
 }finally{await db.close()}
});

test('outcomes break down each payment type and never treat archived NoJob as No Fare',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Booking" ("pickupDueTime" timestamp DEFAULT '2026-10-21 12:00:00',"bookingSource" text,"externalId" text,"ourReference" text,status text,"paymentType" text);
   INSERT INTO "Booking" (status,"paymentType") VALUES
   ('COMPLETED','Cash'),('COMPLETED','Cash'),('COMPLETED','Account'),('COMPLETED',' Card '),('COMPLETED',NULL),
   ('CANCELLED','Cash'),('CANCELLED','Account'),('CANCELLED','Card'),
   ('NO_FARE','Cash'),('NOFARE','Account'),('NO_FARE','Card'),
   ('CREATED','Cash'),('ARCHIVED_NO_JOB','Cash');`);
  const row=(await db.query(dashboardBookingsSql,['2026-10-21'])).rows[0];
  assert.equal(row.total,13);assert.equal(row.webapp,0);
  assert.deepEqual(row.outcomes,{
   completed:{total:5,cash:2,account:1,card:1,other:1},
   cancelled:{total:3,cash:1,account:1,card:1,other:0},
   noFare:{total:3,cash:1,account:1,card:1,other:0}
  });
  const empty=(await db.query(dashboardBookingsSql,['2026-10-22'])).rows[0];
  assert.equal(empty.total,0);assert.equal(empty.outcomes.completed.total,0);
 }finally{await db.close()}
});
