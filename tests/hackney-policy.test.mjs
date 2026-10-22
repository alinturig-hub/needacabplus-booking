import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {defaultHackneyPolicy,hackneyExpressions,bookingGroupPredicate,validateHackneyPolicy} from '../lib/hackney-policy.mjs';
test('Hackney and street groups preserve independence, missing callsigns and historical snapshot values',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Booking"(id int,"driverCallSign" text,"bookingSource" text,"isStreetPickup" boolean);INSERT INTO "Booking" VALUES(1,'912','OperatorWeb',false),(2,' 403 ','FlaggedBooking',false),(3,'117','FlaggedBooking',false),(4,NULL,NULL,false),(5,'19','OperatorWeb',true),(6,'049','OperatorWeb',false);`);
 for(const [group,expected] of [['hackney',[1,2]],['street',[2,3,5]],['hackney-street',[2]],['private-hire',[3,5,6]],['unknown',[4]]]){
  const values=[];const expressions=hackneyExpressions(defaultHackneyPolicy,v=>{values.push(v);return '$'+values.length});
  const sql=bookingGroupPredicate(group,expressions);
  const result=await db.query(`SELECT id FROM "Booking" booking WHERE ${sql} ORDER BY id`,values);
  assert.deepEqual(result.rows.map(x=>x.id),expected);
 }
 const custom=[];const e=hackneyExpressions({prefixes:['8'],flaggedSources:['Street']},v=>{custom.push(v);return '$'+custom.length});
 assert.equal((await db.query(`SELECT count(*)::int n FROM "Booking" booking WHERE ${bookingGroupPredicate('hackney',e)}`,custom)).rows[0].n,0);
 }finally{await db.close()}
});
test('configuration rejects wildcard prefixes and SQL injection, retaining exact source names as parameters',()=>{
 assert.throws(()=>validateHackneyPolicy({prefixes:['9%'],flaggedSources:['FlaggedBooking']}));
 assert.throws(()=>validateHackneyPolicy({prefixes:[],flaggedSources:['FlaggedBooking']}));
 assert.throws(()=>bookingGroupPredicate('all',{}));
 const values=[];const e=hackneyExpressions({prefixes:['9','9','4'],flaggedSources:["x'); DELETE FROM Booking;--"]},v=>{values.push(v);return '$'+values.length});
 assert.equal(e.hackney.includes('DELETE'),false);assert.equal(e.street.includes('DELETE'),false);assert.deepEqual(values[0],['9%','4%']);
});
