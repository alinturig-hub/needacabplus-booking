import {Pool,type PoolClient} from 'pg';

const globalTaxiCrm=globalThis as unknown as {taxiCrmPool?:Pool};

export class TaxiCrmDatabaseConfigurationError extends Error{}

function connectionString(){
 const value=process.env.TAXICRM_DATABASE_URL?.trim();
 if(!value)throw new TaxiCrmDatabaseConfigurationError('TaxiCRM database connection is not configured.');
 return value;
}

function pool(){
 const url=connectionString();
 globalTaxiCrm.taxiCrmPool??=new Pool({
  connectionString:url,
  application_name:'needacabplus-readonly',
  max:4,
  connectionTimeoutMillis:5000,
  idleTimeoutMillis:30000,
  query_timeout:10000,
  ssl:url.includes('sslmode=require')?{rejectUnauthorized:false}:undefined,
 });
 return globalTaxiCrm.taxiCrmPool;
}

async function readOnly<T>(work:(client:PoolClient)=>Promise<T>){
 const client=await pool().connect();
 try{
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='8s'");
  await client.query("SET LOCAL lock_timeout='2s'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
  const result=await work(client);
  await client.query('COMMIT');
  return result;
 }catch(error){
  await client.query('ROLLBACK').catch(()=>undefined);
  throw error;
 }finally{client.release()}
}

type MetaRow={database_name:string;database_user:string;server_version:string;transaction_read_only:string;rolsuper:boolean;rolcreatedb:boolean;rolcreaterole:boolean;rolreplication:boolean;rolbypassrls:boolean;can_create_database:boolean;can_create_schema:boolean};
type TableRow={schema_name:string;table_name:string;estimated_rows:string|number;size_bytes:string|number};

export type TaxiCrmDatabaseSnapshot={
 checkedAt:string;
 database:string;
 user:string;
 serverVersion:string;
 readOnly:boolean;
 schemaCount:number;
 tableCount:number;
 estimatedRows:number;
 totalSizeBytes:number;
 tables:Array<{schema:string;table:string;estimatedRows:number;sizeBytes:number}>;
};

export function taxiCrmDatabaseConfigured(){return Boolean(process.env.TAXICRM_DATABASE_URL?.trim())}

export async function verifyTaxiCrmDatabase():Promise<TaxiCrmDatabaseSnapshot>{
 return readOnly(async client=>{
  const meta=(await client.query<MetaRow>(`SELECT current_database() database_name,current_user database_user,current_setting('server_version') server_version,current_setting('transaction_read_only') transaction_read_only,
   role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolreplication,role.rolbypassrls,
   has_database_privilege(current_user,current_database(),'CREATE') can_create_database,
   COALESCE(bool_or(has_schema_privilege(current_user,schema_name,'CREATE')),false) can_create_schema
   FROM pg_roles role CROSS JOIN (SELECT schema_name FROM information_schema.schemata WHERE schema_name<>'information_schema' AND schema_name NOT LIKE 'pg_%') schemas
   WHERE role.rolname=current_user
   GROUP BY role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolreplication,role.rolbypassrls`)).rows[0];
  if(!meta)throw new Error('TaxiCRM database identity could not be verified.');
  const rows=(await client.query<TableRow>(`SELECT namespace.nspname schema_name,class.relname table_name,GREATEST(class.reltuples,0)::bigint estimated_rows,pg_total_relation_size(class.oid) size_bytes
   FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
   WHERE class.relkind IN ('r','p') AND namespace.nspname<>'information_schema' AND namespace.nspname NOT LIKE 'pg_%'
   ORDER BY pg_total_relation_size(class.oid) DESC,class.reltuples DESC,class.relname LIMIT 100`)).rows;
  const totals=(await client.query<{schema_count:string|number;table_count:string|number;estimated_rows:string|number;size_bytes:string|number}>(`SELECT count(DISTINCT namespace.nspname) schema_count,count(*) table_count,COALESCE(sum(GREATEST(class.reltuples,0)),0)::bigint estimated_rows,COALESCE(sum(pg_total_relation_size(class.oid)),0)::bigint size_bytes
   FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
   WHERE class.relkind IN ('r','p') AND namespace.nspname<>'information_schema' AND namespace.nspname NOT LIKE 'pg_%'`)).rows[0];
  const restricted=meta.transaction_read_only==='on'&&!meta.rolsuper&&!meta.rolcreatedb&&!meta.rolcreaterole&&!meta.rolreplication&&!meta.rolbypassrls&&!meta.can_create_database&&!meta.can_create_schema;
  return {checkedAt:new Date().toISOString(),database:meta.database_name,user:meta.database_user,serverVersion:meta.server_version,readOnly:restricted,schemaCount:Number(totals?.schema_count||0),tableCount:Number(totals?.table_count||0),estimatedRows:Number(totals?.estimated_rows||0),totalSizeBytes:Number(totals?.size_bytes||0),tables:rows.map(row=>({schema:row.schema_name,table:row.table_name,estimatedRows:Number(row.estimated_rows||0),sizeBytes:Number(row.size_bytes||0)}))};
 });
}
