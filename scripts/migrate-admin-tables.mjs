import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const sourceUrl=process.env.DATABASE_URL;
const targetUrl=process.env.RESTORE_URL;
if(!sourceUrl||!targetUrl)throw new Error('DATABASE_URL and RESTORE_URL are required');
const sourceAddress=new URL(sourceUrl),targetAddress=new URL(targetUrl);
if(sourceAddress.host===targetAddress.host&&sourceAddress.pathname===targetAddress.pathname){
 throw new Error('Source and target must be different databases');
}
if(process.env.MIGRATION_TARGET_HOST&&targetAddress.hostname!==process.env.MIGRATION_TARGET_HOST){
 throw new Error('RESTORE_URL does not point to the expected isolated database');
}

const schemaPath=fileURLToPath(new URL('../db/init.sql',import.meta.url));
const schema=readFileSync(schemaPath,'utf8');
const start=schema.indexOf('CREATE TABLE IF NOT EXISTS staff_accounts (');
const end=schema.indexOf('CREATE TABLE IF NOT EXISTS customer_oauth_states(',start);
if(start<0||end<0)throw new Error('Staff schema block was not found in db/init.sql');
const staffSchema=schema.slice(start,end);
const source=new pg.Client({connectionString:sourceUrl});
const target=new pg.Client({connectionString:targetUrl});
const tables=[
 ['operating_companies','id'],
 ['staff_accounts','id'],
 ['staff_sessions','token_hash'],
 ['admin_login_challenges','token_hash'],
];
const quote=name=>'"'+name.replaceAll('"','""')+'"';
let sourceOpen=false,targetOpen=false;
try{
 await source.connect();
 await target.connect();
 await source.query('BEGIN READ ONLY');sourceOpen=true;
 await target.query('BEGIN');targetOpen=true;
 const targetDatabase=(await target.query('SELECT current_database() AS name')).rows[0].name;
 await target.query(staffSchema);
 const copied={};
 for(const [table,key] of tables){
  const rows=(await source.query(`SELECT * FROM public.${quote(table)}`)).rows;
  for(const row of rows){
   const names=Object.keys(row);
   const assignments=names.filter(name=>name!==key)
    .map(name=>`${quote(name)}=EXCLUDED.${quote(name)}`).join(',');
   await target.query(`INSERT INTO public.${quote(table)} (${names.map(quote).join(',')})
     VALUES (${names.map((_,index)=>'$'+(index+1)).join(',')})
     ON CONFLICT (${quote(key)}) DO UPDATE SET ${assignments}`,Object.values(row));
  }
  copied[table]=rows.length;
 }
 await target.query('COMMIT');targetOpen=false;
 await source.query('COMMIT');sourceOpen=false;
 console.log(JSON.stringify({targetDatabase,copied}));
}catch(error){
 if(targetOpen)await target.query('ROLLBACK').catch(()=>undefined);
 if(sourceOpen)await source.query('ROLLBACK').catch(()=>undefined);
 console.error('Staff-table migration failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{
 await Promise.all([source.end().catch(()=>undefined),target.end().catch(()=>undefined)]);
}
