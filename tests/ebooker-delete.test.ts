import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {deleteEbooker} from '../lib/ebooker-delete';

test('delete retires the link, keeps booking attribution and its slug, and is retry safe',async()=>{
 const db=new PGlite(),id='11111111-1111-4111-8111-111111111111',quote='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(await readFile(new URL('../scripts/migrations/20261102_ebookers.sql',import.meta.url),'utf8'));
  await db.query(`INSERT INTO ebookers(id,slug,settings,enabled) VALUES($1,'test-link','{}',true)`,[id]);
  await db.query(`INSERT INTO ebooker_booking_origins(quote_id,ebooker_id,user_id) VALUES($1,$2,'guest:synthetic')`,[quote,id]);
  const sql=db as unknown as Parameters<typeof deleteEbooker>[0];
  assert.equal(await deleteEbooker(sql,id,2),'conflict');
  assert.equal(await deleteEbooker(sql,id,1),'deleted');
  assert.equal(await deleteEbooker(sql,id,1),'deleted');
  const row=(await db.query<{enabled:boolean;revision:number;deleted:boolean}>(`SELECT enabled,revision,settings ? '_deletedAt' AS deleted FROM ebookers WHERE id=$1`,[id])).rows[0];
  assert.equal(row.enabled,false);assert.equal(row.revision,2);assert.equal(row.deleted,true);
  assert.equal((await db.query(`SELECT * FROM ebooker_booking_origins WHERE ebooker_id=$1`,[id])).rows.length,1);
  assert.equal((await db.query(`SELECT * FROM ebookers WHERE NOT(settings ? '_deletedAt')`)).rows.length,0);
  assert.equal((await db.query(`UPDATE ebookers SET enabled=true WHERE id=$1 AND NOT(settings ? '_deletedAt') RETURNING id`,[id])).rows.length,0);
  await assert.rejects(db.query(`INSERT INTO ebookers(id,slug,settings) VALUES($1,'test-link','{}')`,[quote]));
 }finally{await db.close()}
});
test('default home eBooker is protected and missing ids return missing',async()=>{
 const db=new PGlite(),id='11111111-1111-4111-8111-111111111111';
 try{
  await db.exec(await readFile(new URL('../scripts/migrations/20261102_ebookers.sql',import.meta.url),'utf8'));
  await db.query(`INSERT INTO ebookers(id,slug,settings,enabled) VALUES($1,'needacabplus','{}',true)`,[id]);
  const sql=db as unknown as Parameters<typeof deleteEbooker>[0];
  assert.equal(await deleteEbooker(sql,id,1),'default');
  assert.equal(await deleteEbooker(sql,'22222222-2222-4222-8222-222222222222',1),'missing');
  assert.equal((await db.query<{enabled:boolean}>(`SELECT enabled FROM ebookers WHERE id=$1`,[id])).rows[0].enabled,true);
 }finally{await db.close()}
});
