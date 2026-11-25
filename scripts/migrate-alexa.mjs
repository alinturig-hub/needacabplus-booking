import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
export async function migrateAlexa({env=process.env,Client=pg.Client,readSchema=()=>readFile(new URL('../db/20261117_alexa_private_skill.sql',import.meta.url),'utf8')}={}){
 const runtimeUrl=env.DATABASE_URL,ownerUrl=env.NAC_GRANT_DATABASE_URL||runtimeUrl;
 if(!runtimeUrl||!ownerUrl)throw Error('ALEXA_DATABASE_CONFIGURATION');
 const runtimeAddress=new URL(runtimeUrl),ownerAddress=new URL(ownerUrl);
 if(!['postgres:','postgresql:'].includes(runtimeAddress.protocol)||!['postgres:','postgresql:'].includes(ownerAddress.protocol)||runtimeAddress.hostname!==ownerAddress.hostname||(runtimeAddress.port||'5432')!==(ownerAddress.port||'5432')||runtimeAddress.pathname!==ownerAddress.pathname)throw Error('ALEXA_DATABASE_MISMATCH');
 const runtime=new Client({connectionString:runtimeUrl,connectionTimeoutMillis:5000}),owner=new Client({connectionString:ownerUrl,connectionTimeoutMillis:5000});let transaction=false;
 try{
  await runtime.connect();const identity=(await runtime.query('SELECT current_user AS role,current_database() AS database')).rows[0];
  await owner.connect();if((await owner.query('SELECT current_database() AS database')).rows[0].database!==identity.database)throw Error('ALEXA_DATABASE_MISMATCH');
  await owner.query('BEGIN');transaction=true;await owner.query("SET LOCAL lock_timeout='5s'");await owner.query("SET LOCAL statement_timeout='15s'");await owner.query('SET LOCAL search_path=public');await owner.query("SELECT pg_advisory_xact_lock(hashtext('nac:alexa-schema:v1'))");
  await owner.query(await readSchema());
  const tables=['alexa_authorization_codes','alexa_grants','alexa_conversations','alexa_guest_sessions','alexa_guest_requests','alexa_notification_subscriptions','alexa_notification_outbox','alexa_booking_updates'];
  for(const table of tables){const sql=(await owner.query("SELECT format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO %I',$1::text,$2::text) AS sql",[table,identity.role])).rows[0].sql;await owner.query(sql);}
  await owner.query('COMMIT');transaction=false;
  const ready=(await runtime.query("SELECT bool_and(has_table_privilege(current_user,t.name,p.name)) AS ready FROM unnest($1::text[]) AS t(name) CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p(name)",[tables.map(t=>'public.'+t)])).rows[0]?.ready;
  if(!ready)throw Error('ALEXA_RUNTIME_PRIVILEGES');
  await runtime.query('SELECT code_hash,client_id,customer_id,redirect_uri,code_challenge,expires_at FROM public.alexa_authorization_codes LIMIT 0');
  await runtime.query('SELECT id,client_id,access_hash,refresh_hash,revoked_at FROM public.alexa_grants LIMIT 0');
  await runtime.query('SELECT id,grant_id,session_hash,mode,state,quote_id,quote_token,result FROM public.alexa_conversations LIMIT 0');
  await runtime.query('SELECT principal,user_cipher,api_origin,enabled,consent_at FROM public.alexa_notification_subscriptions LIMIT 0');
  await runtime.query('SELECT id,principal,booking_id,fingerprint,state,attempts FROM public.alexa_notification_outbox LIMIT 0');
  await runtime.query('SELECT principal,booking_id,opted_in,decision_at FROM public.alexa_booking_updates LIMIT 0');
  return {tables:tables.length,runtimeReady:true};
 }catch(error){if(transaction)await owner.query('ROLLBACK').catch(()=>{});throw error;}
 finally{await owner.end().catch(()=>{});await runtime.end().catch(()=>{});}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{console.log('ALEXA_SCHEMA_READY',JSON.stringify(await migrateAlexa()));}
 catch(error){console.error('ALEXA_SCHEMA_UNAVAILABLE',/^[A-Z0-9_]{1,50}$/.test(error?.code||error?.message||'')?error.code||error.message:'MIGRATION_ERROR');process.exitCode=1;}
}
