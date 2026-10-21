import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {dashboardBookingsSql,dashboardFleetSql} from '../lib/admin-dashboard-queries.mjs';

test('today follows London pickup time and counts NAC references without counting tomorrow',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Booking" ("pickupDueTime" timestamp,source text,"externalId" text,"ourReference" text);
   INSERT INTO "Booking" VALUES
   ('2026-10-20 22:59:59','OperatorWeb','1',NULL),
   ('2026-10-20 23:00:00','OperatorWeb','2','NAC-quote'),
   ('2026-10-21 10:00:00','WebApp','3',NULL),
   ('2026-10-21 22:59:59','MobileApp','4',NULL),
   ('2026-10-21 23:00:00','WebApp','5',NULL),
   (NULL,'WebApp','6',NULL);`);
  assert.deepEqual((await db.query(dashboardBookingsSql,['2026-10-21'])).rows,[{total:3,webapp:2}]);
 }finally{await db.close()}
});
test('the clock-change day includes both repeated London hours and excludes the next midnight',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Booking" ("pickupDueTime" timestamp,source text,"externalId" text,"ourReference" text);
   INSERT INTO "Booking" VALUES
   ('2026-10-24 23:00:00','OperatorWeb','1',NULL),
   ('2026-10-25 00:30:00','OperatorWeb','2',NULL),
   ('2026-10-25 01:30:00','OperatorWeb','3',NULL),
   ('2026-10-25 23:59:59','OperatorWeb','4',NULL),
   ('2026-10-26 00:00:00','OperatorWeb','5',NULL);`);
  assert.deepEqual((await db.query(dashboardBookingsSql,['2026-10-25'])).rows,[{total:4,webapp:0}]);
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
  assert.deepEqual((await db.query(dashboardFleetSql,['2026-10-21T12:00:00Z',10])).rows,[{online:2,free:1,busy:1,vehicles:7}]);
 }finally{await db.close()}
});
