import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {ARCHIVE_DB,FROM,TO,JOB,SCHEMA,MIN_INTERVAL_MS,MAX_REQUESTS_PER_RUN,assertArchiveTarget,nextWindow,numberSetting,retryAfterMs,nextRequestAt,persistApiBackoff,savePage,timestamp,validatePage} from '../scripts/autocab-history-import.mjs';

test('UK boundaries are exact; daily windows neither overlap nor skip milliseconds',()=>{
 assert.equal(FROM,'2022-09-29T23:00:00.000Z');assert.equal(TO,'2026-10-18T21:00:00.000Z');
 let w=nextWindow(FROM),windows=1;
 while(w.to!==TO){const last=Date.parse(w.to);w=nextWindow(new Date(last+1));assert.equal(Date.parse(w.from),last+1);windows++;assert.ok(windows<1600)}
 assert.equal(w.to,TO);
});
test('production targets and request rates above eight per minute are rejected',()=>{
 assert.throws(()=>assertArchiveTarget('postgres://user@db/postgres'));
 assertArchiveTarget('postgres://user@db/'+ARCHIVE_DB);
 assert.throws(()=>numberSetting({INTERVAL:'7499'},'INTERVAL',10000,MIN_INTERVAL_MS,300000));
 assert.throws(()=>numberSetting({LIMIT:'201'},'LIMIT',100,1,MAX_REQUESTS_PER_RUN));
 assert.equal(numberSetting({INTERVAL:'7500'},'INTERVAL',10000,MIN_INTERVAL_MS,300000),7500);
 assert.equal(numberSetting({LIMIT:'200'},'LIMIT',100,1,MAX_REQUESTS_PER_RUN),200);
});
test('Retry-After accepts seconds and HTTP dates without shortening cooldown',()=>{
 assert.equal(retryAfterMs('120'),120000);assert.equal(retryAfterMs('Sun, 18 Oct 2026 21:10:00 GMT',Date.parse('2026-10-18T21:00:00Z')),600000);
 assert.equal(retryAfterMs('invalid'),0);
});
test('reject malformed payloads and stuck tokens; accept an empty page with next token',()=>{
 assert.throws(()=>validatePage({bookings:{}},null));
 assert.throws(()=>validatePage({bookings:[{}]},null));
 assert.throws(()=>validatePage({bookings:[],continuationToken:'same'},'same'));
 assert.equal(validatePage({bookings:[],continuationToken:'next'},null).token,'next');
 assert.equal(validatePage({bookings:[],continuationToken:''},null).token,null);
});
test('timestamps use explicit offsets, never machine-local guesses',()=>{
 assert.equal(timestamp('2022-09-30T00:00:00+01:00'),FROM);
 assert.equal(timestamp('2022-09-30T00:00:00'),null);
});
async function database(){const db=new PGlite();await db.exec(SCHEMA);const w=nextWindow(FROM);await db.query('INSERT INTO import_progress(job,window_from,window_to) VALUES($1,$2,$3)',[JOB,w.from,w.to]);return db}
async function state(db){return (await db.query('SELECT * FROM import_progress WHERE job=$1',[JOB])).rows[0]}
test('save full nested payload, deduplicate IDs, advance only after complete page',async()=>{
 const db=await database();try{
 const booking={id:125,companyId:1,bookingType:'ASAP',pickupDueTimeUtc:FROM,pricing:{price:0,unknownFee:{value:2}},archivedBooking:{reason:'Completed'},unknownFutureField:['retained']};
 await savePage(db,await state(db),{bookings:[booking],continuationToken:'next'});
 let progress=await state(db);assert.equal(Number(progress.pages),1);assert.equal(progress.continuation_token,'next');assert.equal(new Date(progress.window_from).toISOString(),FROM);
 booking.pricing.price=12;await savePage(db,progress,{bookings:[booking],continuationToken:null});
 const rows=(await db.query('SELECT * FROM autocab_bookings')).rows;
 assert.equal(rows.length,1);assert.deepEqual(rows[0].raw_payload,booking);assert.equal(rows[0].pricing.unknownFee.value,2);
 progress=await state(db);assert.equal(Number(progress.records_seen),2);assert.equal(progress.continuation_token,null);assert.equal(new Date(progress.window_from).toISOString(),nextWindow(new Date(Date.parse(nextWindow(FROM).to)+1)).from);
 }finally{await db.close()}
});
test('DB failure rolls back bookings, page journal and checkpoint together',async()=>{
 const db=await database();try{
 const wrapped={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO import_pages'))throw new Error('simulated disk error');return db.query(sql,args)}};
 const initial=await state(db);
 await assert.rejects(()=>savePage(wrapped,initial,{bookings:[{id:1,pricing:{price:5}}]}),/simulated disk error/);
 assert.equal((await db.query('SELECT count(*) AS n FROM autocab_bookings')).rows[0].n,0);
 assert.equal(Number((await state(db)).pages),0);
 assert.equal((await db.query('SELECT count(*) AS n FROM import_pages')).rows[0].n,0);
 }finally{await db.close()}
});

test('429 persists the slower rate across runs and never shortens Retry-After',async()=>{
 const db=await database();try{
 const before=Date.now();
 assert.equal(await persistApiBackoff(db,429,'1800',1),1800000);
 let progress=await state(db);
 assert.equal(progress.throttle_floor_ms,10000);
 assert.ok(new Date(progress.not_before).getTime()>=before+1799000);
 assert.equal(Number(progress.pages),0,'Backoff must not skip a page');
 await persistApiBackoff(db,503,null,1);
 progress=await state(db);assert.equal(progress.throttle_floor_ms,10000,'A server retry must not clear the lower-rate fallback');
 assert.ok(new Date(progress.not_before).getTime()>=before+1799000,'A later retry must not shorten an existing Retry-After cooldown');
 const prior='2026-10-18T22:00:00Z';
 assert.equal(nextRequestAt({...progress,last_request_at:prior,not_before:null},7500),Date.parse(prior)+10000);
 }finally{await db.close()}
});
