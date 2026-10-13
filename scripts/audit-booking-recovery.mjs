import pg from 'pg';

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
  const relatedPairs=['BookingLocation','BookingVia','BookingTimelineEvent','BookingSnapshot'];
  const related=[];
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
   const child=(await client.query(`SELECT count(*)::bigint AS archived_rows,
     count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public."${currentName}" current_child
       WHERE current_child.id=backup_child.id AND to_jsonb(current_child)=to_jsonb(backup_child)))::bigint AS unmatched_rows
     FROM public."${backupName}" backup_child
     JOIN public."BookingOrphanBackup_20261006" backup ON backup.id=backup_child."bookingId"
     JOIN public."Booking" current ON current.provider=backup.provider
       AND current."externalId"=backup."externalId"
     WHERE to_jsonb(backup)=to_jsonb(current)`)).rows[0];
   related.push({table:currentName,sameColumns,comparisonAvailable:true,
    archivedRows:Number(child.archived_rows),unmatchedRows:Number(child.unmatched_rows)});
  }
  const allRelatedComparable=related.every(item=>item.comparisonAvailable);
  let fullyCoveredExactRows=null;
  if(allRelatedComparable){
   const coveragePredicates=relatedPairs.map((name,index)=>`AND NOT EXISTS (
     SELECT 1 FROM public."${name}OrphanBackup_20261006" child_${index}
     WHERE child_${index}."bookingId"=backup.id AND NOT EXISTS (
       SELECT 1 FROM public."${name}" current_child_${index}
       WHERE current_child_${index}.id=child_${index}.id
         AND to_jsonb(current_child_${index})=to_jsonb(child_${index})))`).join('\n');
   fullyCoveredExactRows=Number((await client.query(`SELECT count(*)::bigint AS total
     FROM public."BookingOrphanBackup_20261006" backup
     JOIN public."Booking" current ON current.provider=backup.provider
       AND current."externalId"=backup."externalId"
     WHERE to_jsonb(backup)=to_jsonb(current) ${coveragePredicates}`)).rows[0].total);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),sameColumns,currentOnly,backupOnly,
   overlap:Object.fromEntries(Object.entries(compare).map(([name,value])=>[name,Number(value)])),
   withinBackup:Object.fromEntries(Object.entries(withinBackup).map(([name,value])=>[name,Number(value)])),
   related,fullyCoveredExactRows}));
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}
 finally{client.release()}
}catch(error){
 console.error('Recovery audit failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await pool.end()}
