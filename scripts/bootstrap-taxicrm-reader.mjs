import pg from 'pg';

const {Pool}=pg;

export async function bootstrapTaxiCrmReader(){
 const connectionString=process.env.TAXICRM_BOOTSTRAP_DATABASE_URL?.trim(),password=process.env.TAXICRM_READER_PASSWORD?.trim();
 if(!connectionString&&!password)return false;
 if(!connectionString||!password)throw new Error('Both TAXICRM_BOOTSTRAP_DATABASE_URL and TAXICRM_READER_PASSWORD are required for bootstrap.');
 if(!/^[A-Za-z0-9_-]{32,200}$/.test(password))throw new Error('TAXICRM_READER_PASSWORD must be a strong URL-safe value.');
 const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:8000,query_timeout:15000,ssl:connectionString.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
 try{
  await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='needacabplus_reader') THEN CREATE ROLE needacabplus_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF; END $$");
  const passwordSql=(await pool.query("SELECT format('ALTER ROLE needacabplus_reader PASSWORD %L', $1) sql",[password])).rows[0].sql;
  await pool.query(passwordSql);
  await pool.query("ALTER ROLE needacabplus_reader SET default_transaction_read_only='on'");
  await pool.query("ALTER ROLE needacabplus_reader SET statement_timeout='8s'");
  await pool.query("ALTER ROLE needacabplus_reader SET lock_timeout='2s'");
  const databaseSql=(await pool.query("SELECT format('GRANT CONNECT ON DATABASE %I TO needacabplus_reader',current_database()) sql")).rows[0].sql;
  await pool.query(databaseSql);
  const schemas=(await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name<>'information_schema' AND schema_name NOT LIKE 'pg_%' ORDER BY schema_name")).rows;
  for(const {schema_name:schema} of schemas){
   const statements=(await pool.query(`SELECT format('GRANT USAGE ON SCHEMA %I TO needacabplus_reader', $1) usage_sql,format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO needacabplus_reader', $1) tables_sql,format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA %I TO needacabplus_reader', $1) sequences_sql`,[schema])).rows[0];
   await pool.query(statements.usage_sql);await pool.query(statements.tables_sql);await pool.query(statements.sequences_sql);
   const owners=(await pool.query(`SELECT DISTINCT owner.rolname owner_name FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace JOIN pg_roles owner ON owner.oid=class.relowner WHERE namespace.nspname=$1 AND class.relkind IN ('r','p','S') UNION SELECT current_user`,[schema])).rows;
   for(const {owner_name:owner} of owners){
    const defaults=(await pool.query(`SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON TABLES TO needacabplus_reader',$1,$2) tables_sql,format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON SEQUENCES TO needacabplus_reader',$1,$2) sequences_sql`,[owner,schema])).rows[0];
    await pool.query(defaults.tables_sql);await pool.query(defaults.sequences_sql);
   }
  }
  console.log(`TaxiCRM read-only role ready across ${schemas.length} application schemas.`);
  return true;
 }finally{await pool.end()}
}
