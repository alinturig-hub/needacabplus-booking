import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {ARCHIVE_DB,FROM,TO,JOB,SCHEMA,MIN_INTERVAL_MS,MAX_REQUESTS_PER_RUN,assertArchiveTarget,nightBoostActive,trialPhase,requestInterval,runBudgetAvailable,nextWindow,numberSetting,retryAfterMs,nextRequestAt,persistApiBackoff,savePage,timestamp,validatePage} from '../scripts/autocab-history-import.mjs';

test('UK boundaries are exact; daily windows neither overlap nor skip milliseconds',()=>{
 assert.equal(FROM,'2022-09-29T23:00:00.000Z');assert.equal(TO,'2026-10-18T21:00:00.000Z');
 let w=nextWindow(FROM),windows=1;
 while(w.to!==TO){const last=Date.parse(w.to);w=nextWindow(new Date(last+1));assert.equal(Date.parse(w.from),last+1);windows++;assert.ok(windows<1600)}
 assert.equal(w.to,TO);
});
test('production targets and unsafe daytime settings are rejected',()=>{
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

test('night window follows London midnight and 04:00 across BST/GMT transitions',()=>{
 const enabled=iso=>nightBoostActive(true,Date.parse(iso));
 assert.equal(enabled('2026-10-19T22:59:59Z'),false);
 assert.equal(enabled('2026-10-19T23:00:00Z'),true);
 assert.equal(enabled('2026-10-20T02:59:59Z'),true);
 assert.equal(enabled('2026-10-20T03:00:00Z'),false);
 assert.equal(enabled('2026-10-26T00:00:00Z'),true);
 assert.equal(enabled('2026-10-26T04:00:00Z'),false);
 assert.equal(enabled('2026-10-25T00:30:00Z'),true);
 assert.equal(enabled('2026-10-25T01:30:00Z'),true);
 assert.equal(enabled('2026-03-29T02:59:59Z'),true);
 assert.equal(enabled('2026-03-29T03:00:00Z'),false);
 assert.equal(nightBoostActive(false,Date.parse('2026-10-20T00:00:00Z')),false);
});
test('night raises ceiling 60 percent, bypasses batch pauses and restores daytime pacing at 04:00',()=>{
 assert.equal(requestInterval({},7500,false),7500);
 assert.equal(requestInterval({},7500,true),4688);
 const exhausted={requests:500,maxRequests:200,now:100,deadline:50};
 assert.equal(runBudgetAvailable({...exhausted,night:true}),true);
 assert.equal(runBudgetAvailable({...exhausted,night:false}),false);
 assert.equal(requestInterval({throttle_floor_ms:10000},7500,true),10000);
 assert.equal(requestInterval({rate_multiplier:'0.9'},7500,true),5209);
 assert.equal(requestInterval({rate_multiplier:'0.81'},7500,true),5788);
});
test('each error reduces persisted rate by ten percent; successful pages do not reset it',async()=>{
 const db=await database();try{
 await persistApiBackoff(db,503,null,1);
 assert.equal(Number((await state(db)).rate_multiplier),0.9);
 await persistApiBackoff(db,503,null,2);
 assert.equal(Number((await state(db)).rate_multiplier),0.81);
 const before=await state(db);
 await savePage(db,before,{bookings:[{id:42}]});
 const after=await state(db);
 assert.equal(Number(after.rate_multiplier),0.81);
 assert.equal(new Date(after.not_before).getTime(),new Date(before.not_before).getTime());
 assert.equal(Number(after.pages),1);
 }finally{await db.close()}
});

const trialStart=Date.parse('2026-10-19T12:00:00Z');
const trialFixture={trial_started_at:new Date(trialStart).toISOString(),trial_until:new Date(trialStart+3600000).toISOString(),trial_pause_until:new Date(trialStart+4200000).toISOString(),trial_reference_multiplier:'0.4',rate_multiplier:'0.4'};
test('temporary 20/min ceiling expires after 60 minutes, pauses 10, and restores the prior reduced regime',()=>{
 assert.equal(trialPhase(trialFixture,trialStart-1),'normal');
 assert.equal(trialPhase(trialFixture,trialStart),'active');
 assert.equal(trialPhase(trialFixture,trialStart+3599999),'active');
 assert.equal(requestInterval(trialFixture,7500,false,trialStart),3000);
 assert.equal(trialPhase(trialFixture,trialStart+3600000),'pause');
 assert.equal(nextRequestAt(trialFixture,7500,trialStart+3600000),trialStart+4200000);
 assert.equal(trialPhase(trialFixture,trialStart+4199999),'pause');
 assert.equal(trialPhase(trialFixture,trialStart+4200000),'normal');
 assert.equal(requestInterval(trialFixture,7500,false,trialStart+4200000),18750);
 assert.equal(requestInterval(trialFixture,7500,true,trialStart+4200000),11719);
 assert.throws(()=>trialPhase({...trialFixture,trial_until:new Date(trialStart+7200000).toISOString()},trialStart),/Invalid temporary/);
 assert.throws(()=>trialPhase({...trialFixture,trial_pause_until:new Date(trialStart+4800000).toISOString()},trialStart),/Invalid temporary/);
});
test('trial never clears an API cooldown, 429 floor or new ten-percent error reductions',async()=>{
 const db=await database();try{
 await db.query('UPDATE import_progress SET rate_multiplier=0.4,trial_started_at=$2,trial_until=$3,trial_pause_until=$4,trial_reference_multiplier=0.4 WHERE job=$1',[JOB,trialFixture.trial_started_at,trialFixture.trial_until,trialFixture.trial_pause_until]);
 const before=await state(db);
 assert.equal(requestInterval(before,7500,false,trialStart),3000);
 await persistApiBackoff(db,503,'1800',1);
 let after=await state(db);
 assert.equal(Number(after.rate_multiplier),0.36);
 assert.equal(requestInterval(after,7500,false,trialStart),3334);
 assert.ok(nextRequestAt(after,3334,trialStart)>=new Date(after.not_before).getTime());
 await persistApiBackoff(db,429,null,1);after=await state(db);
 assert.equal(after.throttle_floor_ms,10000);
 assert.ok(requestInterval(after,7500,false,trialStart)>=10000);
 assert.equal(Number(after.trial_reference_multiplier),0.4);
 assert.equal(Number(after.pages),0);
 }finally{await db.close()}
});
