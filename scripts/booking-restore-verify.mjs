import pg from 'pg';

const connectionString=process.env.RESTORE_URL||process.env.DATABASE_URL;
if(!connectionString)throw new Error('RESTORE_URL or DATABASE_URL is required');

const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:8000,
 ssl:connectionString.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
try{
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='60s'");
  const identity=(await client.query(`SELECT current_database() AS database,
    pg_database_size(current_database())::bigint AS bytes`)).rows[0];
  const tables=(await client.query(`SELECT c.relname AS name,c.reltuples::bigint AS estimated_rows
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
  const counts={};
  for(const table of ['bookings','customer_accounts']){
   if(tables.some(row=>row.name===table)){
    counts[table]=Number((await client.query(`SELECT count(*)::bigint AS total FROM public.${table}`)).rows[0].total);
   }
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({database:identity.database,bytes:Number(identity.bytes),
   tableCount:tables.length,tableNames:tables.map(row=>row.name),counts,
   driverPositionsEstimated:Number(tables.find(row=>row.name==='driver_positions')?.estimated_rows??0)}));
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}
 finally{client.release()}
}catch(error){
 console.error('Restore verification failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await pool.end()}
