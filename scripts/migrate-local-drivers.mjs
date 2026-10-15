import {readFile} from 'node:fs/promises';
import pg from 'pg';
const connectionString=process.env.NAC_GRANT_DATABASE_URL;
if(!connectionString)process.exit(0);
const db=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{
 await db.connect();
 await db.query('BEGIN');
 await db.query(await readFile(new URL('./migrations/20261015_local_drivers.sql',import.meta.url),'utf8'));
 await db.query('COMMIT');
 console.log('Local driver schema migration applied.');
}catch(error){await db.query('ROLLBACK').catch(()=>undefined);console.error('Local driver schema migration failed:',error instanceof Error?error.message:'Unknown error');process.exitCode=1}
finally{await db.end().catch(()=>undefined)}
