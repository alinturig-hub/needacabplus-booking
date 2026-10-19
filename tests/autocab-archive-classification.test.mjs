import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {REGISTRY_SCHEMA} from '../scripts/autocab-history-registry.mjs';
const migration=readFileSync(new URL('../scripts/migrations/20261019_archive_driver_booking_classification.sql',import.meta.url),'utf8');
test('operational roster excludes inactive, suspended, archived and unknown states without deleting history',async()=>{
 const db=new PGlite();try{
 await db.exec(REGISTRY_SCHEMA);
 await db.exec('CREATE TABLE autocab_bookings(autocab_id text PRIMARY KEY,archived_booking jsonb,raw_payload jsonb)');
 for(const [id,callsign,flags] of [
  ['1',' 901 ',{active:true,suspended:false}],['2','101',{active:false,suspended:false}],
  ['3','902',{active:true,suspended:true}],['4','102',{active:true,suspended:false,archivedDate:'2026-01-01'}],
  ['5','103',{active:true}],['6','104',{active:true,suspended:false}],['7',null,{active:true,suspended:false}],
 ])await db.query('INSERT INTO autocab_drivers(autocab_id,callsign,raw_payload,payload_sha256) VALUES($1,$2,$3,$4)',[id,callsign,JSON.stringify(flags),'fixture']);
 await db.exec(migration);await db.exec(migration);
 assert.deepEqual((await db.query('SELECT autocab_id,driver_category FROM autocab_active_drivers ORDER BY autocab_id')).rows,[{autocab_id:'1',driver_category:'HACKNEY'},{autocab_id:'6',driver_category:'PRIVATE_HIRE'},{autocab_id:'7',driver_category:'UNKNOWN'}]);
 assert.equal((await db.query('SELECT count(*) n FROM autocab_drivers')).rows[0].n,7);
 }finally{await db.close()}
});
test('flagged source and historical Hackney callsign are separate evidence; current roster never rewrites history',async()=>{
 const db=new PGlite();try{
 await db.exec(REGISTRY_SCHEMA);
 await db.exec('CREATE TABLE autocab_bookings(autocab_id text PRIMARY KEY,archived_booking jsonb,raw_payload jsonb)');
 const fixtures=[['a','FlaggedBooking','901','FLAGGED_BOOKING','HACKNEY'],['b','Operator','901','HACKNEY_BOOKING','HACKNEY'],['c','Operator','101','PRIVATE_HIRE_BOOKING','PRIVATE_HIRE'],['d','FlaggedBooking',null,'FLAGGED_BOOKING','UNKNOWN'],['e',null,'901','UNKNOWN','HACKNEY'],['f','Operator',null,'UNKNOWN','UNKNOWN'],['g','FlaggedBooking','101','FLAGGED_BOOKING','PRIVATE_HIRE']];
 for(const [id,source,callsign] of fixtures)await db.query('INSERT INTO autocab_bookings VALUES($1,$2,$3)',[id,JSON.stringify({originalAutoID:123,driver:{id:1,callsign}}),JSON.stringify({bookingSource:source})]);
 await db.exec(migration);
 await db.query("INSERT INTO autocab_drivers(autocab_id,callsign,raw_payload,payload_sha256) VALUES('1','100','{}','fixture')");
 const rows=(await db.query('SELECT autocab_id,service_category,driver_category,original_booking_id FROM autocab_booking_classification ORDER BY autocab_id')).rows;
 assert.deepEqual(rows,fixtures.map(([id,,,service,driver])=>({autocab_id:id,service_category:service,driver_category:driver,original_booking_id:'123'})));
 assert.equal((await db.query('SELECT count(*) n FROM autocab_bookings')).rows[0].n,7);
 }finally{await db.close()}
});
