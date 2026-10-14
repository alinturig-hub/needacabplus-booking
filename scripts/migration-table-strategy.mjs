import pg from 'pg';

const url=process.env.TAXICRM_DATABASE_URL;
if(!url)throw new Error('TAXICRM_DATABASE_URL is required');
const db=new pg.Client({connectionString:url});
try{
 await db.connect();
 await db.query('BEGIN READ ONLY');
 const tables=(await db.query(`SELECT c.oid,c.relname AS name,c.reltuples::bigint AS estimated_rows,
  pg_total_relation_size(c.oid)::bigint AS bytes
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
 const columns=(await db.query(`SELECT table_name,column_name FROM information_schema.columns
  WHERE table_schema='public'`)).rows;
 const primaryKeys=(await db.query(`SELECT c.conrelid AS table_oid,
  array_agg(a.attname ORDER BY key.ordinality) AS columns
  FROM pg_constraint c JOIN LATERAL unnest(c.conkey) WITH ORDINALITY key(attnum,ordinality) ON true
  JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=key.attnum
  WHERE c.contype='p' GROUP BY c.conrelid`)).rows;
 const pkByOid=new Map(primaryKeys.map(row=>[String(row.table_oid),row.columns]));
 const dateCandidates=['updatedAt','updated_at','createdAt','created_at','receivedAt',
  'received_at','recorded_at','occurredAt','occurred_at'];
 const result=tables.map(table=>{
  const names=new Set(columns.filter(row=>row.table_name===table.name).map(row=>row.column_name));
  return {name:table.name,estimatedRows:Number(table.estimated_rows),bytes:Number(table.bytes),
   primaryKey:pkByOid.get(String(table.oid))??[],
   timestampColumns:dateCandidates.filter(name=>names.has(name))};
 });
 await db.query('COMMIT');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),tables:result}));
}catch(error){
 await db.query('ROLLBACK').catch(()=>undefined);
 console.error('Migration strategy inventory failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await db.end().catch(()=>undefined)}
