import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {checkTargets,saveBatch,JOB} from '../scripts/autocab-history-merge.mjs';
const schema=readFileSync(new URL('../scripts/migrations/20261020_autocab_history_merge.sql',import.meta.url),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec('CREATE TABLE public."Booking"(id text PRIMARY KEY,provider text,"externalId" text,status text);');
 await db.exec(schema);
 await db.query('INSERT INTO autocab_history.copy_progress(job,source_database,source_rows,source_last_fetched_at) VALUES($1,$2,3,now())',[JOB,'needacabplus_archive_20261018']);
 return db;
}
function entry(id,ref='42',reason='Dispatched'){
 const raw={id,archivedBooking:{originalAutoID:ref,reason},rejectedVehicles:[9,11],unknownNested:{retained:true},pricing:{price:0}};
 return {autocab_id:id,raw_payload:raw,archived_booking:raw.archivedBooking,payload_sha256:`hash-${id}`,pricing:raw.pricing,archive_reason:reason,first_fetched_at:'2026-10-20T00:00:00Z',last_fetched_at:'2026-10-20T01:00:00Z'};
}
test('only explicit archive and shared-live destinations are accepted',()=>{
 checkTargets('postgres://x@pjyhbtnxutfkh77rpfg5ke0o/needacabplus_archive_20261018','postgres://x@q9fahphg3lydu18inysgmerq/postgres');
 assert.throws(()=>checkTargets('postgres://x@old/needacabplus_archive_20261018','postgres://x@q9fahphg3lydu18inysgmerq/postgres'));
 assert.throws(()=>checkTargets('postgres://x@pjyhbtnxutfkh77rpfg5ke0o/needacabplus_archive_20261018','postgres://x@old/postgres'));
});
test('all phases and unknown JSON survive; original booking ID links to canonical row without modifying it',async()=>{
 const db=await fixture();try{
 await db.exec(`INSERT INTO public."Booking" VALUES('live','AUTOCAB','42','COMPLETED')`);
 const a=entry('100'),b=entry('101','42','Completed');
 assert.equal(await saveBatch(db,[a,b],''),'101');
 const {rows}=await db.query('SELECT raw_payload,canonical_booking_id,canonical_status FROM autocab_history.booking_entries ORDER BY autocab_id');
 assert.equal(rows.length,2);assert.deepEqual(rows[0].raw_payload,a.raw_payload);
 assert.ok(rows.every(r=>r.canonical_booking_id==='live'&&r.canonical_status==='COMPLETED'));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public."Booking"')).rows[0].n,1);
 }finally{await db.close()}
});
test('replay creates no duplicate; content conflict rolls back the whole batch and checkpoint',async()=>{
 const db=await fixture();try{
 const a=entry('100');await saveBatch(db,[a],'');
 await db.query('UPDATE autocab_history.copy_progress SET last_id=$2,copied_rows=0 WHERE job=$1',[JOB,'']);
 await saveBatch(db,[a],'');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM autocab_history.entries')).rows[0].n,1);
 await db.query('UPDATE autocab_history.copy_progress SET last_id=$2,copied_rows=0 WHERE job=$1',[JOB,'']);
 const changed={...a,raw_payload:{...a.raw_payload,changed:true}};
 await assert.rejects(()=>saveBatch(db,[changed,entry('101')],''),/content conflict/);
 assert.equal((await db.query('SELECT last_id FROM autocab_history.copy_progress')).rows[0].last_id,'');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM autocab_history.entries')).rows[0].n,1);
 }finally{await db.close()}
});
test('stale checkpoint, malformed and unordered batches cannot advance progress',async()=>{
 const db=await fixture();try{
 await saveBatch(db,[entry('100')],'');
 await assert.rejects(()=>saveBatch(db,[entry('101')],''),/checkpoint changed/);
 await assert.rejects(()=>saveBatch(db,[entry('102'),entry('101')],'100'),/batch order/);
 await assert.rejects(()=>saveBatch(db,[],'100'),/Empty batch/);
 assert.equal((await db.query('SELECT copied_rows FROM autocab_history.copy_progress')).rows[0].copied_rows,1);
 }finally{await db.close()}
});
