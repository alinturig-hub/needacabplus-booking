import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {repairBatch,REPAIR_JOB} from '../scripts/repair-booking-details.mjs';
import {TEXTS,DATES,DECIMALS,INTS,JSONS} from '../scripts/autocab-canonical-reconcile.mjs';
async function fixture(){
 const db=new PGlite();
 const fields=new Map([...TEXTS.map(k=>[k,'text']),...DATES.map(k=>[k,'timestamp']),...DECIMALS.map(k=>[k,'numeric']),...INTS.map(k=>[k,'integer']),...JSONS.map(k=>[k,'jsonb']),...['acceptedAt','cancelledAt','noFareAt'].map(k=>[k,'timestamp']),...['driverForename','driverSurname','flightDetails','cabExchangeReference'].map(k=>[k,'text'])]);
 await db.exec(`CREATE TABLE public."Booking"(${[...fields].map(([k,t])=>'"'+k+'" '+t+(k==='id'?' PRIMARY KEY':'')).join(',')});CREATE TABLE public."BookingLocation"(id text PRIMARY KEY,"bookingId" text,type text,address text NOT NULL,"zoneId" text,"zoneDescriptor" text,"zoneName" text,latitude numeric,longitude numeric,"createdAt" timestamp NOT NULL,"updatedAt" timestamp NOT NULL,UNIQUE("bookingId",type));CREATE TABLE public."BookingVia"(id text PRIMARY KEY,"bookingId" text,position integer,address text NOT NULL,"zoneId" text,"zoneDescriptor" text,"zoneName" text,latitude numeric,longitude numeric,"createdAt" timestamp NOT NULL,"updatedAt" timestamp NOT NULL,UNIQUE("bookingId",position));CREATE TABLE autocab_bookings(autocab_id text,raw_payload jsonb);CREATE TABLE "WebhookEvent"(id text,"externalBookingId" text,payload jsonb,status text,"eventType" text,"receivedAt" timestamp);CREATE SCHEMA autocab_history;CREATE TABLE autocab_history.entries(original_booking_id text,autocab_id text,archived_booking jsonb,raw_payload jsonb);`);
 await db.exec(readFileSync(new URL('../scripts/migrations/20261022_booking_assignment_details.sql',import.meta.url),'utf8'));
 const raw={autocab_booking_id:123,driver_name:'Saved name',pickup_address:'Station',pickup_zone_id:12,pickup_lat:50,pickup_lng:-4,passenger_on_board_at:'2026-10-22T06:00:00+01:00',vias:[{Address:'Via',Coordinates:{Latitude:0,Longitude:0}}]};
 await db.query(`INSERT INTO "Booking"(id,provider,"externalId",status,"rawPayload","createdAt","updatedAt",price) VALUES('a','AUTOCAB','123','COMPLETED',$1,'2022-10-01','2026-10-20',0)`,[JSON.stringify(raw)]);
 const adapter={query:(sql,args)=>sql.startsWith('SELECT pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args)};
 return {db,adapter,raw};
}
test('repair persists saved JSON facts and relations, audits changes, preserves financial zero/status/updatedAt, and resumes without duplicates',async()=>{
 const {db,adapter,raw}=await fixture();try{
 const r=await repairBatch(adapter);assert.equal(r.changed,1);
 const b=(await db.query('SELECT * FROM "Booking"')).rows[0];assert.equal(b.status,'COMPLETED');assert.equal(Number(b.price),0);assert.equal(b.updatedAt.toISOString(),'2026-10-20T00:00:00.000Z');assert.deepEqual(b.rawPayload,raw);assert.equal(b.assignmentDetails.driver.name,'Saved name');assert.equal(b.pickedUpAt.toISOString(),'2026-10-22T05:00:00.000Z');
 assert.equal((await db.query('SELECT * FROM "BookingLocation"')).rows[0].zoneId,'12');assert.equal((await db.query('SELECT * FROM "BookingVia"')).rows.length,1);
 assert.equal((await db.query('SELECT * FROM autocab_history.assignment_repair_audit')).rows.length,1);
 assert.equal((await repairBatch(adapter)).done,true);
 assert.equal((await db.query('SELECT checked FROM autocab_history.assignment_repair_progress WHERE job_key=$1',[REPAIR_JOB])).rows[0].checked,1);
 }finally{await db.close()}
});
test('dry run and a dependent failure commit neither facts nor checkpoints',async()=>{
 const {db,adapter}=await fixture();try{
 assert.equal((await repairBatch(adapter,{dryRun:true})).changed,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM autocab_history.assignment_repair_progress')).rows[0].n,0);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO autocab_history.assignment_repair_audit')?Promise.reject(Error('audit failure')):adapter.query(sql,args)};
 await assert.rejects(repairBatch(failing),/audit failure/);
 assert.equal((await db.query('SELECT count(*)::int n FROM "BookingLocation"')).rows[0].n,0);assert.equal((await db.query('SELECT "assignmentDetails" FROM "Booking"')).rows[0].assignmentDetails,null);
 assert.equal((await db.query('SELECT count(*)::int n FROM autocab_history.assignment_repair_progress')).rows[0].n,0);
 }finally{await db.close()}
});
