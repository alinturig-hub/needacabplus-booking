import pg from 'pg';

const sourceUrl=process.env.DATABASE_URL;
const targetUrl=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
const cutoff=process.env.MIGRATION_CUTOFF;
const apply=process.argv.includes('--apply');
if(!sourceUrl||!targetUrl||!expectedHost||!cutoff){
 throw new Error('DATABASE_URL, RESTORE_URL, MIGRATION_TARGET_HOST and MIGRATION_CUTOFF are required');
}
if(new URL(targetUrl).hostname!==expectedHost)throw new Error('Unexpected restore database host');
if(new URL(sourceUrl).host===new URL(targetUrl).host)throw new Error('Source and target must differ');
if(!Number.isFinite(Date.parse(cutoff)))throw new Error('MIGRATION_CUTOFF must be an ISO date');

const source=new URL(sourceUrl);
const db=new pg.Client({connectionString:targetUrl});
const schema='migration_needacabplus_source';
const server='migration_needacabplus_source_server';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const timestampCandidates=['updated_at','received_at','created_at','recorded_at'];
let transactionOpen=false;

async function setupForeignSource(){
 const exists=(await db.query('SELECT 1 FROM pg_foreign_server WHERE srvname=$1',[server])).rowCount>0;
 if(exists)return;
 await db.query(`CREATE SCHEMA ${quote(schema)}`);
 const serverSql=(await db.query(`SELECT format(
  'CREATE SERVER ${server} FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host %L, port %L, dbname %L)',
  $1::text,$2::text,$3::text) AS sql`,
  [source.hostname,source.port||'5432',decodeURIComponent(source.pathname.slice(1))])).rows[0].sql;
 await db.query(serverSql);
 const mappingSql=(await db.query(`SELECT format(
  'CREATE USER MAPPING FOR CURRENT_USER SERVER ${server} OPTIONS (user %L, password %L)',
  $1::text,$2::text) AS sql`,
  [decodeURIComponent(source.username),decodeURIComponent(source.password)])).rows[0].sql;
 await db.query(mappingSql);
 await db.query(`IMPORT FOREIGN SCHEMA public FROM SERVER ${server} INTO ${quote(schema)}`);
}

async function tablePlan(){
 const rows=(await db.query(`SELECT c.oid,c.relname AS name,c.reltuples::bigint AS estimated_rows
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
   AND EXISTS (SELECT 1 FROM pg_class f JOIN pg_namespace fn ON fn.oid=f.relnamespace
    WHERE fn.nspname=$1 AND f.relname=c.relname AND f.relkind='f')
  ORDER BY c.relname`,[schema])).rows;
 const attributes=(await db.query(`SELECT c.oid AS table_oid,a.attname AS name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  WHERE n.nspname='public' ORDER BY c.oid,a.attnum`)).rows;
 const keys=(await db.query(`SELECT con.conrelid AS table_oid,
  array_agg(a.attname::text ORDER BY key.ordinality) AS columns
  FROM pg_constraint con JOIN LATERAL unnest(con.conkey) WITH ORDINALITY key(attnum,ordinality) ON true
  JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=key.attnum
  WHERE con.contype='p' GROUP BY con.conrelid`)).rows;
 const columnMap=new Map();
 for(const row of attributes){
  const id=String(row.table_oid);
  if(!columnMap.has(id))columnMap.set(id,[]);
  columnMap.get(id).push(row.name);
 }
 const keyMap=new Map(keys.map(row=>[String(row.table_oid),row.columns]));
 return rows.map(row=>{
  const columns=columnMap.get(String(row.oid))??[];
  return {name:row.name,columns,primaryKey:keyMap.get(String(row.oid))??[],
   timestamp:timestampCandidates.find(name=>columns.includes(name))??null,
   estimatedRows:Number(row.estimated_rows)};
 });
}

try{
 await db.connect();
 await db.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN');transactionOpen=true;
 await setupForeignSource();
 const plan=await tablePlan();
 if(plan.length!==42)throw new Error(`Expected 42 Need A Cab Plus tables; found ${plan.length}`);
 const withoutKey=plan.filter(item=>item.primaryKey.length===0).map(item=>item.name);
 const fullRefresh=plan.filter(item=>item.primaryKey.length>0&&!item.timestamp).map(item=>item.name);
 if(!apply){
  console.log(JSON.stringify({mode:'plan',cutoff,tableCount:plan.length,withoutKey,fullRefresh,
   timestampTables:plan.filter(item=>item.primaryKey.length>0&&item.timestamp).length}));
  await db.query('ROLLBACK');transactionOpen=false;
 }else{
  await db.query("SET LOCAL session_replication_role='replica'");
  const applied=[];
  for(const item of plan){
   if(item.primaryKey.length===0)continue;
   const columns=item.columns.map(quote).join(',');
   const target=`public.${quote(item.name)}`;
   const foreign=`${quote(schema)}.${quote(item.name)}`;
   const conflict=item.primaryKey.map(quote).join(',');
   const updated=item.columns.filter(name=>!item.primaryKey.includes(name))
    .map(name=>`${quote(name)}=EXCLUDED.${quote(name)}`).join(',');
   const where=item.timestamp?` WHERE ${quote(item.timestamp)}>=$1`:'';
   const sql=`INSERT INTO ${target} (${columns}) SELECT ${columns} FROM ${foreign}${where}
    ${item.name==='driver_positions'?'ON CONFLICT DO NOTHING':
     `ON CONFLICT (${conflict}) ${updated?`DO UPDATE SET ${updated}`:'DO NOTHING'}`}`;
   try{
    const result=await db.query(sql,item.timestamp?[cutoff]:[]);
    const outcome={table:item.name,matchedRows:result.rowCount,
     mode:item.timestamp?'since-cutoff':'full'};
    applied.push(outcome);
   }catch(error){
    throw new Error(`Reconciliation stopped at ${item.name}: ${error instanceof Error?error.message:'Unknown error'}`);
   }
  }
  await db.query('COMMIT');transactionOpen=false;
  console.log(JSON.stringify({mode:'applied',cutoff,applied,withoutKey}));
 }
}catch(error){
 if(transactionOpen)await db.query('ROLLBACK').catch(()=>undefined);
 console.error('Need A Cab Plus delta reconciliation failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await db.end().catch(()=>undefined)}
