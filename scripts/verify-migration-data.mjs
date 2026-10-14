import pg from 'pg';

const taxicrmUrl=process.env.TAXICRM_DATABASE_URL;
const needacabplusUrl=process.env.DATABASE_URL;
const targetUrl=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
if(!taxicrmUrl||!needacabplusUrl||!targetUrl||!expectedHost||
 new URL(targetUrl).hostname!==expectedHost){
 throw new Error('Source URLs and the expected migration database are required');
}
const taxiTables=['Booking','BookingLocation','BookingVia','BookingTimelineEvent',
 'BookingSnapshot','WebhookEvent','BookingOrphanBackup_20261006',
 'BookingLocationOrphanBackup_20261006','BookingViaOrphanBackup_20261006',
 'BookingTimelineEventOrphanBackup_20261006','BookingSnapshotOrphanBackup_20261006',
 'customer_profiles'];
const localTables=['bookings','customer_accounts','driver_positions','drivers',
 'webhook_events','staff_accounts','operating_companies'];
const quote=name=>'"'+name.replaceAll('"','""')+'"';
async function counts(url,tables){
 const db=new pg.Client({connectionString:url});
 try{
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const result={};
  for(const name of tables){
   result[name]=Number((await db.query(`SELECT count(*)::bigint AS total FROM public.${quote(name)}`)).rows[0].total);
  }
  await db.query('COMMIT');
  return result;
 }catch(error){await db.query('ROLLBACK').catch(()=>undefined);throw error}
 finally{await db.end().catch(()=>undefined)}
}
try{
 const [taxicrmSource,taxicrmTarget,localSource,localTarget]=await Promise.all([
  counts(taxicrmUrl,taxiTables),counts(targetUrl,taxiTables),
  counts(needacabplusUrl,localTables),counts(targetUrl,localTables)]);
 const compare=(source,target)=>Object.fromEntries(Object.keys(source)
  .map(name=>[name,{source:source[name],target:target[name],difference:source[name]-target[name]}]));
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),
  taxicrm:compare(taxicrmSource,taxicrmTarget),
  needacabplus:compare(localSource,localTarget)}));
}catch(error){
 console.error('Migration verification failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}
