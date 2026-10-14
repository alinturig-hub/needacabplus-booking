import pg from 'pg';

const targetUrl=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
const apply=process.argv.includes('--apply');
if(!targetUrl||!expectedHost||new URL(targetUrl).hostname!==expectedHost){
 throw new Error('RESTORE_URL must point to the expected migration database');
}
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const db=new pg.Client({connectionString:targetUrl});
let open=false;
try{
 await db.connect();
 const tables=(await db.query(`SELECT c.relname AS name,
  array_agg(a.attname::text ORDER BY a.attnum) AS columns
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  WHERE n.nspname='public' AND c.relkind='r'
   AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p')
   AND EXISTS(SELECT 1 FROM pg_class f JOIN pg_namespace fn ON fn.oid=f.relnamespace
    WHERE fn.nspname='migration_taxicrm_source' AND f.relname=c.relname AND f.relkind='f')
  GROUP BY c.relname ORDER BY c.relname`)).rows;
 if(tables.length!==13)throw new Error(`Expected 13 TaxiCRM tables without primary keys; found ${tables.length}`);
 if(!apply){console.log(JSON.stringify({mode:'plan',tables:tables.map(t=>t.name)}))}
 else{
  const outcomes=[];
  for(const table of tables){
   const name=quote(table.name),columns=table.columns.map(quote).join(',');
   await db.query('BEGIN');open=true;
   try{
    await db.query("SET LOCAL session_replication_role='replica'");
    const removed=await db.query(`DELETE FROM public.${name}`);
    const inserted=await db.query(`INSERT INTO public.${name} (${columns})
     SELECT ${columns} FROM migration_taxicrm_source.${name}`);
    await db.query('COMMIT');open=false;
    const result={table:table.name,removed:removed.rowCount,inserted:inserted.rowCount};
    outcomes.push(result);console.log(JSON.stringify(result));
   }catch(error){
    await db.query('ROLLBACK');open=false;
    throw new Error(`Failed at ${table.name}: ${error instanceof Error?error.message:'Unknown error'}`);
   }
  }
  console.log(JSON.stringify({mode:'applied',outcomes}));
 }
}catch(error){
 if(open)await db.query('ROLLBACK').catch(()=>undefined);
 console.error('No-key reconciliation failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await db.end().catch(()=>undefined)}
