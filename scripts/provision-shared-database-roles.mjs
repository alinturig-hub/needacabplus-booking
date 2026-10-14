import pg from 'pg';

const targetUrl=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
const nacPassword=process.env.MIGRATION_NAC_PASSWORD;
const nacReaderPassword=process.env.MIGRATION_NAC_READER_PASSWORD;
const taxiPassword=process.env.MIGRATION_TAXICRM_PASSWORD;
const apply=process.argv.includes('--apply');
const prepare=process.argv.includes('--prepare');
if(apply&&prepare)throw new Error('Choose --prepare or --apply');
if(!targetUrl||!expectedHost||new URL(targetUrl).hostname!==expectedHost){
 throw new Error('RESTORE_URL must point to the expected migration database');
}
if(apply&&(!nacPassword||!nacReaderPassword||!taxiPassword||
 new Set([nacPassword,nacReaderPassword,taxiPassword]).size!==3)){
 throw new Error('Three distinct application role passwords are required');
}
const nacRole='needacabplus_shared_app';
const nacReaderRole='needacabplus_shared_reader';
const taxiRole='taxicrm_shared_app';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const db=new pg.Client({connectionString:targetUrl});
let open=false;
try{
 await db.connect();
 await db.query('BEGIN');open=true;
 const rows=(await db.query(`SELECT c.relname AS name,
   CASE WHEN f.relname IS NOT NULL THEN 'taxicrm' ELSE 'needacabplus' END AS owner
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_class f ON f.relname=c.relname AND f.relkind='f'
   AND f.relnamespace='migration_taxicrm_source'::regnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  ORDER BY c.relname`)).rows;
 const taxiTables=rows.filter(row=>row.owner==='taxicrm');
 const nacTables=rows.filter(row=>row.owner==='needacabplus');
 if(taxiTables.length!==63||nacTables.length!==42){
  throw new Error(`Unexpected table split: TaxiCRM ${taxiTables.length}, Need A Cab Plus ${nacTables.length}`);
 }
 const sequences=(await db.query(`SELECT seq.relname AS name,
   CASE WHEN f.relname IS NOT NULL THEN 'taxicrm' ELSE 'needacabplus' END AS owner
  FROM pg_class seq JOIN pg_namespace ns ON ns.oid=seq.relnamespace
  JOIN pg_depend dep ON dep.objid=seq.oid AND dep.deptype IN ('a','i')
  JOIN pg_class tbl ON tbl.oid=dep.refobjid
  LEFT JOIN pg_class f ON f.relname=tbl.relname AND f.relkind='f'
   AND f.relnamespace='migration_taxicrm_source'::regnamespace
  WHERE ns.nspname='public' AND seq.relkind='S'
  ORDER BY seq.relname`)).rows;
 if(apply||prepare){
  for(const [role,password] of [[nacRole,nacPassword],
   [nacReaderRole,nacReaderPassword],[taxiRole,taxiPassword]]){
   const exists=(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount>0;
   if(apply){
    const sql=(await db.query(`SELECT format($1::text,$2::text,$3::text) AS sql`,[
     exists?'ALTER ROLE %I WITH LOGIN PASSWORD %L':'CREATE ROLE %I WITH LOGIN PASSWORD %L',
     role,password])).rows[0].sql;
    await db.query(sql);
   }else if(!exists){
    await db.query(`CREATE ROLE ${quote(role)} NOLOGIN`);
   }
   await db.query(`GRANT CONNECT ON DATABASE ${quote(new URL(targetUrl).pathname.slice(1))} TO ${quote(role)}`);
   await db.query(`GRANT USAGE ON SCHEMA public TO ${quote(role)}`);
  }
  for(const row of taxiTables){
   await db.query(`GRANT SELECT ON public.${quote(row.name)} TO ${quote(nacRole)}`);
   await db.query(`GRANT SELECT ON public.${quote(row.name)} TO ${quote(nacReaderRole)}`);
   await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.${quote(row.name)} TO ${quote(taxiRole)}`);
  }
  for(const row of nacTables){
   await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.${quote(row.name)} TO ${quote(nacRole)}`);
   await db.query(`GRANT SELECT ON public.${quote(row.name)} TO ${quote(taxiRole)}`);
  }
  for(const row of sequences){
   const role=row.owner==='taxicrm'?taxiRole:nacRole;
   await db.query(`GRANT USAGE,SELECT ON SEQUENCE public.${quote(row.name)} TO ${quote(role)}`);
  }
 }
 await db.query('COMMIT');open=false;
 console.log(JSON.stringify({mode:apply?'applied':prepare?'prepared':'plan',roles:[nacRole,nacReaderRole,taxiRole],
  taxiTables:taxiTables.length,nacTables:nacTables.length,sequences:sequences.length}));
}catch(error){
 if(open)await db.query('ROLLBACK').catch(()=>undefined);
 console.error('Shared-role provisioning failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await db.end().catch(()=>undefined)}
