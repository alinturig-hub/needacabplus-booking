import pg from 'pg';
import {isDeepStrictEqual} from 'node:util';

const url=process.env.TAXICRM_DATABASE_URL;
if(!url)throw new Error('TAXICRM_DATABASE_URL is required');
const pool=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:8000,
 ssl:url.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});

try{
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='120s'");
  await client.query('SET LOCAL max_parallel_workers_per_gather=0');
  await client.query("SET LOCAL work_mem='8MB'");
  const rows=(await client.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('Booking','BookingOrphanBackup_20261006')
    ORDER BY table_name,ordinal_position`)).rows;
  const columns=Object.fromEntries(['Booking','BookingOrphanBackup_20261006'].map(name=>
   [name,rows.filter(row=>row.table_name===name).map(row=>row.column_name)]));
  const currentOnly=columns.Booking.filter(name=>!columns.BookingOrphanBackup_20261006.includes(name));
  const backupOnly=columns.BookingOrphanBackup_20261006.filter(name=>!columns.Booking.includes(name));
  const sameColumns=currentOnly.length===0&&backupOnly.length===0;
  const exactPredicate=sameColumns?'to_jsonb(backup)=to_jsonb(current)':'false';
  const shared=new Set(columns.Booking.filter(name=>columns.BookingOrphanBackup_20261006.includes(name)));
  const matches=name=>shared.has(name)?`backup."${name}"=current."${name}"`:'false';
  const compare=(await client.query(`SELECT count(*)::bigint AS overlapping,
    count(*) FILTER (WHERE ${matches('id')})::bigint AS same_id,
    count(*) FILTER (WHERE ${matches('status')})::bigint AS same_status,
    count(*) FILTER (WHERE ${matches('rawPayload')})::bigint AS same_payload,
    count(*) FILTER (WHERE ${matches('updatedAt')})::bigint AS same_updated_at,
    count(*) FILTER (WHERE ${exactPredicate})::bigint AS exact_row_duplicates
    FROM public."BookingOrphanBackup_20261006" backup
    JOIN public."Booking" current ON current.provider=backup.provider
      AND current."externalId"=backup."externalId"`)).rows[0];
  const withinBackup=(await client.query(`SELECT count(*)::bigint AS duplicate_keys,
    coalesce(sum(n-1),0)::bigint AS extra_rows FROM (
    SELECT count(*) n FROM public."BookingOrphanBackup_20261006"
    GROUP BY provider,"externalId" HAVING count(*)>1) duplicates`)).rows[0];
  const exactRootIds=(await client.query(`SELECT backup.id
    FROM public."BookingOrphanBackup_20261006" backup
    JOIN public."Booking" current ON current.id=backup.id
      AND current.provider=backup.provider AND current."externalId"=backup."externalId"
    WHERE to_jsonb(backup)=to_jsonb(current)`)).rows.map(row=>row.id);
  const relatedPairs=['BookingLocation','BookingVia','BookingTimelineEvent','BookingSnapshot'];
  const related=[];
  const uncoveredRoots=new Set();
  for(const currentName of relatedPairs){
   const backupName=`${currentName}OrphanBackup_20261006`;
   const relatedColumns=(await client.query(`SELECT table_name,column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN ($1,$2)`,[currentName,backupName])).rows;
   const currentColumns=relatedColumns.filter(row=>row.table_name===currentName).map(row=>row.column_name);
   const backupColumns=relatedColumns.filter(row=>row.table_name===backupName).map(row=>row.column_name);
   const sameColumns=currentColumns.length===backupColumns.length&&
    currentColumns.every(name=>backupColumns.includes(name));
   if(!sameColumns||!currentColumns.includes('bookingId')||!currentColumns.includes('id')){
    related.push({table:currentName,sameColumns,comparisonAvailable:false});
    continue;
   }
   const archived=(await client.query(`SELECT * FROM public."${backupName}"
     WHERE "bookingId"=ANY($1::text[])`,[exactRootIds])).rows;
   const currentIds=archived.map(row=>row.id);
   const currentRows=currentIds.length?(await client.query(`SELECT * FROM public."${currentName}"
     WHERE id=ANY($1::text[])`,[currentIds])).rows:[];
   const currentById=new Map(currentRows.map(row=>[row.id,row]));
   let unmatchedRows=0;
   for(const child of archived){
    if(!isDeepStrictEqual(child,currentById.get(child.id))){
     unmatchedRows++;
     uncoveredRoots.add(child.bookingId);
    }
   }
   related.push({table:currentName,sameColumns,comparisonAvailable:true,
    archivedRows:archived.length,unmatchedRows});
  }
  const allRelatedComparable=related.every(item=>item.comparisonAvailable);
  const fullyCoveredExactRows=allRelatedComparable?
   exactRootIds.filter(id=>!uncoveredRoots.has(id)).length:null;
  await client.query('COMMIT');
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),sameColumns,currentOnly,backupOnly,
   overlap:Object.fromEntries(Object.entries(compare).map(([name,value])=>[name,Number(value)])),
   withinBackup:Object.fromEntries(Object.entries(withinBackup).map(([name,value])=>[name,Number(value)])),
   related,exactRootCount:exactRootIds.length,fullyCoveredExactRows}));
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}
 finally{client.release()}
}catch(error){
 console.error('Recovery audit failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await pool.end()}
