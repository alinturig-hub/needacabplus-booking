import pg from 'pg';
import {isDeepStrictEqual} from 'node:util';

const url=process.env.TAXICRM_BOOTSTRAP_DATABASE_URL;
const readerUrl=process.env.TAXICRM_DATABASE_URL;
if(!url||!readerUrl)throw new Error('Both TaxiCRM database URLs are required');
const expectedArg=process.argv.find(arg=>arg.startsWith('--expected='));
const expected=Number(expectedArg?.split('=')[1]);
if(!expectedArg||!Number.isSafeInteger(expected)||expected<0){
 throw new Error('Pass the audited duplicate count as --expected=N');
}
const apply=process.argv.includes('--apply');
const pool=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:8000,
 ssl:url.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
const readerPool=new pg.Pool({connectionString:readerUrl,max:1,connectionTimeoutMillis:8000,
 ssl:readerUrl.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});

try{
 const identitySql=`SELECT current_database() AS database,
   inet_server_addr()::text AS address,inet_server_port() AS port`;
 const [writerIdentity,readerIdentity]=await Promise.all([
  pool.query(identitySql).then(result=>result.rows[0]),
  readerPool.query(identitySql).then(result=>result.rows[0])]);
 if(!isDeepStrictEqual(writerIdentity,readerIdentity)){
  throw new Error('TaxiCRM writer and reader do not refer to the same database');
 }
 const client=await pool.connect();
 let committed=false;
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='120s'");
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query('SET LOCAL max_parallel_workers_per_gather=0');
  await client.query("SET LOCAL work_mem='8MB'");
  const ids=(await client.query(`SELECT backup.id
    FROM public."BookingOrphanBackup_20261006" backup
    JOIN public."Booking" current ON current.id=backup.id
      AND current.provider=backup.provider AND current."externalId"=backup."externalId"
    WHERE to_jsonb(backup)=to_jsonb(current)
    FOR UPDATE OF backup FOR SHARE OF current`)).rows.map(row=>row.id);
  if(ids.length!==expected)throw new Error(`Duplicate count changed: expected ${expected}, found ${ids.length}`);
  const relatedPairs=['BookingLocation','BookingVia','BookingTimelineEvent','BookingSnapshot'];
  const counts={};
  for(const currentName of relatedPairs){
   const backupName=`${currentName}OrphanBackup_20261006`;
   const columns=(await client.query(`SELECT table_name,column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN ($1,$2)`,[currentName,backupName])).rows;
   const currentColumns=columns.filter(row=>row.table_name===currentName).map(row=>row.column_name);
   const backupColumns=columns.filter(row=>row.table_name===backupName).map(row=>row.column_name);
   if(!currentColumns.includes('id')||!currentColumns.includes('bookingId')||
      currentColumns.length!==backupColumns.length||
      !currentColumns.every(name=>backupColumns.includes(name))){
    throw new Error(`${currentName} archive schema differs from the current table`);
   }
   const archived=(await client.query(`SELECT * FROM public."${backupName}"
     WHERE "bookingId"=ANY($1::text[]) FOR UPDATE`,[ids])).rows;
   const childIds=archived.map(row=>row.id);
   const currentRows=childIds.length?(await client.query(`SELECT * FROM public."${currentName}"
     WHERE id=ANY($1::text[]) FOR SHARE`,[childIds])).rows:[];
   const currentById=new Map(currentRows.map(row=>[row.id,row]));
   for(const child of archived){
    if(!isDeepStrictEqual(child,currentById.get(child.id))){
     throw new Error(`${currentName} has an archived detail not identical to the current record`);
    }
   }
   counts[backupName]=archived.length;
  }
  if(apply){
   for(const currentName of relatedPairs){
    const backupName=`${currentName}OrphanBackup_20261006`;
    const deleted=await client.query(`DELETE FROM public."${backupName}"
      WHERE "bookingId"=ANY($1::text[])`,[ids]);
    if(deleted.rowCount!==counts[backupName])throw new Error(`${backupName} deletion count changed`);
   }
   const deleted=await client.query(`DELETE FROM public."BookingOrphanBackup_20261006"
     WHERE id=ANY($1::text[])`,[ids]);
   if(deleted.rowCount!==ids.length)throw new Error('Booking archive deletion count changed');
   await client.query('COMMIT');
   committed=true;
  }else{
   await client.query('ROLLBACK');
  }
  console.log(JSON.stringify({mode:committed?'deleted':'dry_run',bookingDuplicates:ids.length,
   archivedDetails:counts}));
 }catch(error){
  if(!committed)await client.query('ROLLBACK').catch(()=>undefined);
  throw error;
 }finally{client.release()}
}catch(error){
 console.error('Recovery deduplication failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await Promise.all([pool.end(),readerPool.end()])}
