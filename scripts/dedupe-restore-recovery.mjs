import {isDeepStrictEqual} from 'node:util';
import pg from 'pg';

const url=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
if(!url||!expectedHost)throw new Error('RESTORE_URL and MIGRATION_TARGET_HOST are required');
if(new URL(url).hostname!==expectedHost)throw new Error('Unexpected restore database host');
const expected=Number(process.env.EXPECTED_EXACT_DUPLICATES);
if(!Number.isSafeInteger(expected)||expected<0)throw new Error('EXPECTED_EXACT_DUPLICATES is required');

const db=new pg.Client({connectionString:url});
const related=['BookingLocation','BookingVia','BookingTimelineEvent','BookingSnapshot'];
let open=false;
try{
 await db.connect();
 await db.query('BEGIN');open=true;
 await db.query("SET LOCAL statement_timeout='120s'");
 const ids=(await db.query(`SELECT backup.id
   FROM public."BookingOrphanBackup_20261006" backup
   JOIN public."Booking" current ON current.id=backup.id
    AND current.provider=backup.provider AND current."externalId"=backup."externalId"
   WHERE to_jsonb(backup)=to_jsonb(current)`)).rows.map(row=>row.id);
 if(ids.length!==expected)throw new Error(`Expected ${expected} exact duplicates; found ${ids.length}`);
 const deleted={};
 for(const name of related){
  const archive=`${name}OrphanBackup_20261006`;
  const archived=(await db.query(`SELECT * FROM public."${archive}"
    WHERE "bookingId"=ANY($1::text[])`,[ids])).rows;
  const currentIds=archived.map(row=>row.id);
  const currentRows=currentIds.length?(await db.query(`SELECT * FROM public."${name}"
    WHERE id=ANY($1::text[])`,[currentIds])).rows:[];
  const currentById=new Map(currentRows.map(row=>[row.id,row]));
  if(archived.some(row=>!isDeepStrictEqual(row,currentById.get(row.id)))){
   throw new Error(`Archived ${name} rows differ from current rows`);
  }
  deleted[archive]=(await db.query(`DELETE FROM public."${archive}"
    WHERE "bookingId"=ANY($1::text[])`,[ids])).rowCount;
 }
 deleted.BookingOrphanBackup_20261006=(await db.query(`DELETE FROM public."BookingOrphanBackup_20261006"
   WHERE id=ANY($1::text[])`,[ids])).rowCount;
 if(deleted.BookingOrphanBackup_20261006!==expected)throw new Error('Deleted booking count changed');
 await db.query('COMMIT');open=false;
 console.log(JSON.stringify({deleted}));
}catch(error){
 if(open)await db.query('ROLLBACK').catch(()=>undefined);
 console.error('Recovery cleanup failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await db.end().catch(()=>undefined)}
