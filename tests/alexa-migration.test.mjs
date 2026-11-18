import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateAlexa} from '../scripts/migrate-alexa.mjs';
test('schema setup rejects different target databases before opening a connection',async()=>{let connected=0;class Client{constructor(){connected++}}await assert.rejects(migrateAlexa({env:{DATABASE_URL:'postgres://app@one/db',NAC_GRANT_DATABASE_URL:'postgres://owner@two/db'},Client}),/MISMATCH/);assert.equal(connected,0)});
test('migration is repeatable and grants only the three Alexa tables',async()=>{
 const db=new PGlite();await db.exec('CREATE TABLE customer_accounts(id uuid PRIMARY KEY); CREATE TABLE existing_bookings(id uuid); CREATE ROLE synthetic_alexa_runtime;');
 class Client{
  constructor(options){this.role=new URL(options.connectionString).username}
  async connect(){}async end(){}
  async query(sql,args){
   if(sql==='SELECT current_user AS role,current_database() AS database')return {rows:[{role:this.role,database:'same_database'}]};
   if(sql==='SELECT current_database() AS database')return {rows:[{database:'same_database'}]};
   if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
   if(sql.includes('CREATE TABLE IF NOT EXISTS alexa_authorization_codes')){await db.exec(sql);return {rows:[]};}
   return db.query(sql,args);
  }
 }
 try{
  const env={DATABASE_URL:'postgres://synthetic_alexa_runtime@same/db',NAC_GRANT_DATABASE_URL:'postgres://owner@same/db'};
  assert.deepEqual(await migrateAlexa({env,Client}),{tables:3,runtimeReady:true});await migrateAlexa({env,Client});
  for(const table of ['alexa_authorization_codes','alexa_grants','alexa_conversations'])for(const permission of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['synthetic_alexa_runtime',table,permission])).rows[0].allowed,true);
  assert.equal((await db.query("SELECT has_table_privilege('synthetic_alexa_runtime','existing_bookings','INSERT') AS allowed")).rows[0].allowed,false);
 }finally{await db.close()}
});
