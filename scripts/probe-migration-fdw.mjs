import pg from 'pg';

const sourceUrl=process.env.TAXICRM_DATABASE_URL;
const targetUrl=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
if(!sourceUrl||!targetUrl||!expectedHost)throw new Error('Source, target and expected host are required');
if(new URL(targetUrl).hostname!==expectedHost)throw new Error('Unexpected restore database host');
const source=new URL(sourceUrl);
const target=new pg.Client({connectionString:targetUrl});
let open=false;
try{
 await target.connect();
 await target.query('BEGIN');open=true;
 await target.query('CREATE SCHEMA migration_probe');
 const server=(await target.query(`SELECT format(
  'CREATE SERVER migration_probe_server FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host %L, port %L, dbname %L)',
  $1::text,$2::text,$3::text) AS sql`,
  [source.hostname,source.port||'5432',decodeURIComponent(source.pathname.slice(1))])).rows[0].sql;
 await target.query(server);
 const mapping=(await target.query(`SELECT format(
  'CREATE USER MAPPING FOR CURRENT_USER SERVER migration_probe_server OPTIONS (user %L, password %L)',
  $1::text,$2::text) AS sql`,
  [decodeURIComponent(source.username),decodeURIComponent(source.password)])).rows[0].sql;
 await target.query(mapping);
 await target.query('IMPORT FOREIGN SCHEMA public LIMIT TO ("Booking") FROM SERVER migration_probe_server INTO migration_probe');
 const count=(await target.query('SELECT count(*)::bigint AS n FROM migration_probe."Booking"')).rows[0].n;
 console.log(JSON.stringify({sourceReachable:true,bookingRows:Number(count)}));
}catch(error){
 console.error('FDW probe failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{
 if(open)await target.query('ROLLBACK').catch(()=>undefined);
 await target.end().catch(()=>undefined);
}
