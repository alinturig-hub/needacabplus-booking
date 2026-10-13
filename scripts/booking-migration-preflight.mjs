import pg from 'pg';

const {Pool}=pg;

const sourceUrl=process.env.TAXICRM_DATABASE_URL;
const targetUrl=process.env.DATABASE_URL;
if(!sourceUrl||!targetUrl){
 console.error('Set TAXICRM_DATABASE_URL and DATABASE_URL before running the preflight.');
 process.exit(2);
}

function createPool(connectionString){
 return new Pool({connectionString,max:1,connectionTimeoutMillis:5000,ssl:connectionString.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
}

async function inspect(pool){
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='15s'");
  const identity=(await client.query(`SELECT current_database() AS database,current_user AS role,
    pg_database_size(current_database())::bigint AS database_bytes,
    current_setting('transaction_read_only')='on' AS read_only`)).rows[0];
  const tables=(await client.query(`SELECT c.relname AS name,c.reltuples::bigint AS estimated_rows,
    pg_total_relation_size(c.oid)::bigint AS bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
  const references=(await client.query(`SELECT c.conrelid::regclass::text AS dependent_table
    FROM pg_constraint c WHERE c.contype='f' AND c.confrelid=to_regclass('public."Booking"')
    ORDER BY dependent_table`)).rows.map(row=>row.dependent_table);
  await client.query('COMMIT');
  return {database:identity.database,role:identity.role,readOnly:identity.read_only,
   databaseBytes:Number(identity.database_bytes),tables:tables.map(row=>({name:row.name,estimatedRows:Number(row.estimated_rows),bytes:Number(row.bytes)})),
   bookingDependents:references};
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}
 finally{client.release()}
}

async function exactBookingCounts(pool,source){
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='120s'");
  const tables=source?['Booking','BookingOrphanBackup_20261006']:['bookings'];
  const counts={};
  for(const table of tables){
   const exists=(await client.query('SELECT to_regclass($1) IS NOT NULL AS present',[`public."${table}"`])).rows[0]?.present;
   if(exists)counts[table]=Number((await client.query(`SELECT count(*)::bigint AS total FROM public."${table}"`)).rows[0].total);
  }
  if(source){
   counts.byProvider=(await client.query('SELECT provider,count(*)::bigint AS total FROM public."Booking" GROUP BY provider ORDER BY provider')).rows
    .map(row=>({provider:row.provider,total:Number(row.total)}));
   if(counts.BookingOrphanBackup_20261006!==undefined){
    const columns=new Set((await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='BookingOrphanBackup_20261006'`)).rows.map(row=>row.column_name));
    if(columns.has('provider')&&columns.has('externalId')){
     counts.orphanBackupNotInBooking=Number((await client.query(`SELECT count(*)::bigint AS total
       FROM public."BookingOrphanBackup_20261006" backup WHERE NOT EXISTS (
        SELECT 1 FROM public."Booking" current
        WHERE current.provider=backup.provider AND current."externalId"=backup."externalId")`)).rows[0].total);
     if(columns.has('status')&&columns.has('pickupDueTime')){
      counts.orphanBackupMissingByStatus=(await client.query(`SELECT backup.status,count(*)::bigint AS total,
        min(backup."pickupDueTime") AS earliest_pickup,max(backup."pickupDueTime") AS latest_pickup
        FROM public."BookingOrphanBackup_20261006" backup WHERE NOT EXISTS (
         SELECT 1 FROM public."Booking" current
         WHERE current.provider=backup.provider AND current."externalId"=backup."externalId")
        GROUP BY backup.status ORDER BY total DESC`)).rows.map(row=>({status:row.status,total:Number(row.total),
         earliestPickup:row.earliest_pickup,latestPickup:row.latest_pickup}));
     }
    }
   }
  }
  await client.query('COMMIT');
  return counts;
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}
 finally{client.release()}
}

const source=createPool(sourceUrl),target=createPool(targetUrl);
try{
 const [from,to]=await Promise.all([inspect(source),inspect(target)]);
 const sourceTables=new Set(from.tables.map(table=>table.name));
 const targetTables=new Set(to.tables.map(table=>table.name));
 const collisions=[...sourceTables].filter(name=>targetTables.has(name));
 const required=['Booking','BookingLocation','BookingVia','WebhookEvent','BookingTimelineEvent','BookingSnapshot'];
 const missing=required.filter(name=>!sourceTables.has(name));
 const sourceAddress=new URL(sourceUrl),targetAddress=new URL(targetUrl);
 const sameDatabase=sourceAddress.hostname===targetAddress.hostname&&
  (sourceAddress.port||'5432')===(targetAddress.port||'5432')&&sourceAddress.pathname===targetAddress.pathname;
 const result={checkedAt:new Date().toISOString(),source:from,target:to,exactNameCollisions:collisions,
  missingRequiredSourceTables:missing,sameDatabase,
  readyForRestore:!missing.length&&!collisions.length&&!sameDatabase};
 if(process.argv.includes('--exact')){
  const [sourceCounts,targetCounts]=await Promise.all([exactBookingCounts(source,true),exactBookingCounts(target,false)]);
  result.exactBookingCounts={source:sourceCounts,target:targetCounts};
 }
 console.log(JSON.stringify(result,null,2));
 if(!result.readyForRestore)process.exitCode=1;
}catch(error){
 console.error('Booking migration preflight failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await Promise.all([source.end(),target.end()])}
