import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {mapEntry,mapLocation,prepareQueue,reconcileBatch,FIELDS,TEXTS,DATES,DECIMALS,INTS,JSONS} from '../scripts/autocab-canonical-reconcile.mjs';
function entry(ref='42',archiveId='100',reason='Completed',time='2022-10-01T12:00:00Z'){
 const raw={id:Number(archiveId),bookingType:'ASAP',pickupDueTimeUtc:'2022-10-01T10:00:00Z',name:'Fixture rider',passengers:0,pricing:{price:0,unmappedFee:{exact:12}},archivedBooking:{originalAutoID:Number(ref),reason,archiveTime:time,completedAtTime:'2022-10-01T11:00:00+01:00',driver:{id:7,callsign:'912'}},unknownFuture:{retain:[null,0,false]},rejectedVehicles:[77,88],pickup:{address:{text:'Fixture pickup',coordinate:{latitude:50.3,longitude:-4.1}}},destination:{address:{text:'Fixture destination'}},vias:[{address:{text:'Fixture via'}}]};
 return {autocab_id:archiveId,original_booking_id:ref,raw_payload:raw,ambiguous:false};
}
async function fixture(){
 const db=new PGlite();
 const types=new Map([...TEXTS.map(k=>[k,'text']),...DATES.map(k=>[k,'timestamp']),...DECIMALS.map(k=>[k,'numeric']),...INTS.map(k=>[k,'integer']),...JSONS.map(k=>[k,'jsonb']),['loyaltyCardCostValue','numeric'],['isStreetPickup','boolean']]);
 await db.exec(`CREATE TABLE public."Booking"(${FIELDS.map(k=>`"${k}" ${types.get(k)}${k==='id'?' PRIMARY KEY':''}`).join(',')},UNIQUE(provider,"externalId"));CREATE TYPE "BookingLocationType" AS ENUM('PICKUP','DESTINATION');CREATE TABLE public."BookingLocation"(id text PRIMARY KEY,"bookingId" text REFERENCES public."Booking"(id),type "BookingLocationType",address text,"zoneId" text,"zoneDescriptor" text,"zoneName" text,longitude numeric,latitude numeric,"createdAt" timestamp,"updatedAt" timestamp,UNIQUE("bookingId",type));CREATE TABLE public."BookingVia"(id text PRIMARY KEY,"bookingId" text REFERENCES public."Booking"(id),position integer,address text,"zoneId" text,"zoneDescriptor" text,"zoneName" text,longitude numeric,latitude numeric,"createdAt" timestamp,"updatedAt" timestamp,UNIQUE("bookingId",position));`);
 await db.exec(`CREATE SCHEMA autocab_history;CREATE TABLE autocab_history.entries(autocab_id text PRIMARY KEY,original_booking_id text,archived_booking jsonb,raw_payload jsonb);`);
 await db.exec(readFileSync(new URL('../scripts/migrations/20261020_autocab_canonical_reconcile.sql',import.meta.url),'utf8'));
 const adapter={query:(sql,args)=>sql.startsWith('SELECT pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args)};
 return {db,adapter};
}
async function store(db,e){await db.query('INSERT INTO autocab_history.entries VALUES($1,$2,$3,$4)',[e.autocab_id,e.original_booking_id,JSON.stringify(e.raw_payload.archivedBooking),JSON.stringify(e.raw_payload)])}
test('complete raw JSON, zero, null, unknown keys and original identity survive normalization',()=>{
 const e=entry();const {booking,locations,vias}=mapEntry(e);
 assert.deepEqual(booking.rawPayload,e.raw_payload);assert.equal(booking.externalId,'42');assert.equal(booking.bookingType,'Archived');assert.equal(booking.typeOfBooking,'ASAP');assert.equal(booking.price,'0');assert.equal(booking.passengers,0);assert.equal(booking.completedAt,'2022-10-01T10:00:00.000');assert.equal(booking.driverCallSign,'912');assert.equal(locations.length,2);assert.equal(vias.length,1);assert.equal(vias[0].position,0);
 assert.throws(()=>mapEntry({...e,original_booking_id:'43'}),/identity mismatch/);
 assert.equal(mapLocation({address:{text:'x',coordinate:{latitude:500,longitude:-500}}},'x','PICKUP').latitude,null);
});
test('NoJob never becomes no-fare; historical and tied states cannot become active dispatch',()=>{
 for(const reason of ['NoJob','ExchangedNoJob','Dispatched','Recover','Suspended','Skipped','Unknown']){
  const {booking}=mapEntry(entry('42','100',reason));assert.ok(booking.status.startsWith('ARCHIVED_'));assert.equal(booking.completedAt,null);assert.equal(booking.bookingType,'Archived');
 }
 assert.equal(mapEntry({...entry(),ambiguous:true}).booking.status,'ARCHIVED_REVIEW');
 const missing=entry();missing.raw_payload.archivedBooking.completedAtTime='0001-01-01T00:00:00Z';assert.ok(mapEntry(missing).flags.includes('COMPLETED_TIMESTAMP_MISSING'));
});
test('queue chooses latest provider archive time, skips existing references and marks tied conflicting states',async()=>{
 const {db,adapter}=await fixture();try{
 await store(db,entry('42','100','Dispatched','2022-10-01T10:00:00Z'));await store(db,entry('42','101','Completed','2022-10-01T11:00:00Z'));await store(db,entry('43','102','Completed'));await store(db,entry('44','103','Cancelled'));await store(db,entry('44','104','Completed'));
 await db.query('INSERT INTO public."Booking"(id,provider,"externalId",status) VALUES(\'live\',\'AUTOCAB\',\'43\',\'COMPLETED\')');
 await prepareQueue(adapter);await prepareQueue(adapter);
 const {rows}=await db.query('SELECT original_booking_id,source_entry_id,ambiguous FROM autocab_history.canonical_queue ORDER BY original_booking_id');
 assert.deepEqual(rows,[{original_booking_id:'42',source_entry_id:'101',ambiguous:false},{original_booking_id:'44',source_entry_id:'104',ambiguous:true}]);
 }finally{await db.close()}
});
test('inserts missing canonical booking and relations once; preserves existing live data and links full history',async()=>{
 const {db,adapter}=await fixture();try{
 const a=entry(),b=entry('43','101');await store(db,a);await store(db,b);await prepareQueue(adapter);
 // A webhook wins the race after preparation; importer must not overwrite it.
 await db.query('INSERT INTO public."Booking"(id,provider,"externalId",status,"rawPayload") VALUES(\'live\',\'AUTOCAB\',\'43\',\'COMPLETED\',\'{"newer":true}\')');
 assert.deepEqual(await reconcileBatch(adapter,[a,b]),{inserted:1,existing:1});
 assert.deepEqual(await reconcileBatch(adapter,[a,b]),{inserted:0,existing:2});
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public."Booking"')).rows[0].n,2);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public."BookingLocation"')).rows[0].n,2);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public."BookingVia"')).rows[0].n,1);
 assert.deepEqual((await db.query('SELECT "rawPayload" FROM public."Booking" WHERE id=\'live\'')).rows[0].rawPayload,{newer:true});
 assert.deepEqual((await db.query('SELECT "rawPayload" FROM public."Booking" WHERE "externalId"=\'42\'')).rows[0].rawPayload,a.raw_payload);
 assert.equal((await db.query("SELECT state FROM autocab_history.canonical_queue WHERE original_booking_id='43'")).rows[0].state,'EXISTING');
 }finally{await db.close()}
});
test('dependent write failure rolls back booking, locations and audit together',async()=>{
 const {db,adapter}=await fixture();try{
 const e=entry();await store(db,e);await prepareQueue(adapter);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO public."BookingVia"')?Promise.reject(new Error('fixture dependent failure')):adapter.query(sql,args)};
 await assert.rejects(()=>reconcileBatch(failing,[e]),/dependent failure/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public."Booking"')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM public."BookingLocation"')).rows[0].n,0);
 assert.equal((await db.query('SELECT state FROM autocab_history.canonical_queue')).rows[0].state,'PENDING');
 }finally{await db.close()}
});
test('all emitted columns exist in the canonical Prisma model',()=>{
 const schema=readFileSync(new URL('../prisma/schema.prisma',import.meta.url),'utf8').split('model Booking {')[1].split('\n}')[0];
 for(const f of FIELDS)assert.match(schema,new RegExp(`\\n\\s*${f}\\s+`));
});
