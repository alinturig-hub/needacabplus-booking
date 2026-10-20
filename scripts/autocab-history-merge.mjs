import pg from 'pg';
import {pathToFileURL} from 'node:url';

export const SOURCE_DATABASE='needacabplus_archive_20261018';
export const LIVE_HOST='q9fahphg3lydu18inysgmerq';
export const JOB='archive-20261020-to-shared-live-v1';
export const COLUMNS=['autocab_id','company_id','booking_type','archive_reason','pickup_due_utc','booked_at_utc','pricing','archived_booking','pickup','destination','vias','raw_payload','payload_sha256','first_fetched_at','last_fetched_at'];
const SELECT_COLUMNS=COLUMNS.map(c=>['pickup_due_utc','booked_at_utc','first_fetched_at','last_fetched_at'].includes(c)?`${c}::text AS ${c}`:c).join(',');
const RECORD='autocab_id text,company_id text,booking_type text,archive_reason text,pickup_due_utc timestamptz,booked_at_utc timestamptz,pricing jsonb,archived_booking jsonb,pickup jsonb,destination jsonb,vias jsonb,raw_payload jsonb,payload_sha256 text,first_fetched_at timestamptz,last_fetched_at timestamptz';
export function checkTargets(sourceUrl,targetUrl){
 const s=new URL(sourceUrl),t=new URL(targetUrl);
 if(s.hostname!=='pjyhbtnxutfkh77rpfg5ke0o'||decodeURIComponent(s.pathname.slice(1))!==SOURCE_DATABASE)throw new Error('Unexpected archive source');
 if(t.hostname!==LIVE_HOST||decodeURIComponent(t.pathname.slice(1))!=='postgres'||s.host===t.host)throw new Error('Unexpected live target');
}
export async function saveBatch(db,rows,lastId){
 if(!rows.length)throw new Error('Empty batch cannot advance checkpoint');
 let previous=lastId;
 for(const row of rows){
  if(typeof row.autocab_id!=='string'||row.autocab_id<=previous||!row.raw_payload||!row.payload_sha256)throw new Error('Invalid archive batch order or payload');
  previous=row.autocab_id;
 }
 const payload=JSON.stringify(rows);
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");
  await db.query("SET LOCAL statement_timeout='60s'");
  const {rows:[progress]}=await db.query('SELECT last_id FROM autocab_history.copy_progress WHERE job=$1 FOR UPDATE',[JOB]);
  if(!progress||progress.last_id!==lastId)throw new Error('Copy checkpoint changed');
  await db.query(`INSERT INTO autocab_history.entries(${COLUMNS.join(',')}) SELECT ${COLUMNS.join(',')} FROM jsonb_to_recordset($1::jsonb) AS x(${RECORD}) ON CONFLICT(autocab_id) DO NOTHING`,[payload]);
  // A repeated key with different source content is an error, never an overwrite.
  const {rows:[check]}=await db.query(`SELECT count(*)::int AS matched FROM autocab_history.entries e JOIN jsonb_to_recordset($1::jsonb) AS x(${RECORD}) USING(autocab_id) WHERE e.payload_sha256=x.payload_sha256 AND e.raw_payload=x.raw_payload AND e.archived_booking IS NOT DISTINCT FROM x.archived_booking`,[payload]);
  if(check.matched!==rows.length)throw new Error('Archive content conflict; batch rolled back');
  await db.query('UPDATE autocab_history.copy_progress SET last_id=$2,copied_rows=copied_rows+$3,updated_at=now() WHERE job=$1',[JOB,previous,rows.length]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e}
 return previous;
}
export async function run(env=process.env){
 const sourceUrl=env.AUTOCAB_HISTORY_DATABASE_URL,targetUrl=env.DATABASE_URL;
 if(!sourceUrl||!targetUrl)throw new Error('Archive and live database connections required');
 checkTargets(sourceUrl,targetUrl);
 const apply=process.argv.includes('--apply');
 const batch=Number(env.AUTOCAB_MERGE_BATCH_SIZE??500),minutes=Number(env.AUTOCAB_MERGE_MAX_MINUTES??28);
 if(!Number.isInteger(batch)||batch<1||batch>2000||!Number.isInteger(minutes)||minutes<1||minutes>120)throw new Error('Invalid copy limits');
 const source=new pg.Client({connectionString:sourceUrl,connectionTimeoutMillis:10000});
 const target=new pg.Client({connectionString:targetUrl,connectionTimeoutMillis:10000});
 let stop=false;const onStop=()=>{stop=true};process.on('SIGTERM',onStop);process.on('SIGINT',onStop);
 try{
  await Promise.all([source.connect(),target.connect()]);
  await source.query("SET default_transaction_read_only=on;SET statement_timeout='120s'");
  const {rows:[importState]}=await source.query("SELECT done,window_to,records_seen FROM public.import_progress WHERE job='autocab-history-20220930-20261018'");
  if(!importState?.done||new Date(importState.window_to).toISOString()!=='2026-10-20T09:00:00.000Z')throw new Error('Source import has not completed at the expected cutoff');
  const {rows:[identity]}=await target.query("SELECT current_database() AS db,to_regclass('autocab_history.entries') AS staging");
  if(identity.db!=='postgres'||!identity.staging)throw new Error('Live merge migration required');
  const {rows:[locked]}=await target.query("SELECT pg_try_advisory_lock(hashtext('autocab-history-live-copy')) AS acquired");
  if(!locked.acquired){console.log('History copy already running');return}
  const {rows:[meta]}=await source.query('SELECT count(*)::text AS source_rows,max(last_fetched_at) AS source_last_fetched_at FROM public.autocab_bookings');
  if(!apply){
   const sample=(await source.query("SELECT archived_booking->>'originalAutoID' AS ref FROM public.autocab_bookings ORDER BY autocab_id LIMIT 1000")).rows;
   const refs=[...new Set(sample.map(r=>r.ref).filter(Boolean))];
   const {rows:[overlap]}=await target.query('SELECT count(*)::int AS matched FROM public."Booking" WHERE provider=\'AUTOCAB\' AND "externalId"=ANY($1::text[])',[refs]);
   console.log(JSON.stringify({mode:'read-only-preflight',...meta,sampleEntries:sample.length,sampleUniqueReferences:refs.length,sampleMatchedLive:overlap.matched}));return;
  }
  await target.query('INSERT INTO autocab_history.copy_progress(job,source_database,source_rows,source_last_fetched_at) VALUES($1,$2,$3,$4) ON CONFLICT(job) DO NOTHING',[JOB,SOURCE_DATABASE,meta.source_rows,meta.source_last_fetched_at]);
  let {rows:[state]}=await target.query('SELECT * FROM autocab_history.copy_progress WHERE job=$1',[JOB]);
  if(String(state.source_rows)!==meta.source_rows||new Date(state.source_last_fetched_at).getTime()!==new Date(meta.source_last_fetched_at).getTime())throw new Error('Archive changed since copy began');
  if(state.done){console.log(JSON.stringify({event:'history_copy_complete',rows:state.copied_rows}));return}
  const deadline=Date.now()+minutes*60000;
  while(!stop&&Date.now()<deadline){
   const {rows}=await source.query(`SELECT ${SELECT_COLUMNS} FROM public.autocab_bookings WHERE autocab_id>$1 ORDER BY autocab_id LIMIT $2`,[state.last_id,batch]);
   if(!rows.length){
    const {rows:[actual]}=await target.query('SELECT count(*)::text AS n FROM autocab_history.entries');
    if(actual.n!==meta.source_rows||String(state.copied_rows)!==meta.source_rows)throw new Error('Final archive counts do not match');
    await target.query('UPDATE autocab_history.copy_progress SET done=true,updated_at=now() WHERE job=$1',[JOB]);
    console.log(JSON.stringify({event:'history_copy_complete',rows:actual.n}));break;
   }
   state.last_id=await saveBatch(target,rows,state.last_id);state.copied_rows=String(BigInt(state.copied_rows)+BigInt(rows.length));
   console.log(JSON.stringify({event:'history_batch_saved',rows:rows.length,total:state.copied_rows}));
   await new Promise(r=>setTimeout(r,100));
  }
 }finally{
  process.off('SIGTERM',onStop);process.off('SIGINT',onStop);
  await Promise.allSettled([source.end(),target.end()]);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){run().catch(()=>{console.error('History copy stopped; checkpoint retained. Inspect database connectivity, source immutability and content conflicts.');process.exitCode=1})}
