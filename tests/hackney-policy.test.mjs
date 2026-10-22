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

test('CMAC account jobs remain Hackney and totals include only completed recorded prices',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "AutocabAccount"(provider text,"externalId" text,"accountCode" text,"displayName" text);
 CREATE TABLE "Booking"(id int,provider text,"driverCallSign" text,"bookingSource" text,"isStreetPickup" boolean,"paymentType" text,"accountId" text,"accountCode" text,"accountName" text,status text,price numeric);
 INSERT INTO "AutocabAccount" VALUES('AUTOCAB','2019','CMAC CABX (L)','CMAC CABX'),('OTHER','22','CMAC','CMAC');
 INSERT INTO "Booking" VALUES
 (1,'AUTOCAB','401','OperatorWeb',false,'Account','2019',NULL,NULL,'COMPLETED',10.10),
 (2,'AUTOCAB','912','OperatorWeb',false,'Account',NULL,'CMAC CABX (L)',NULL,'COMPLETED',20.20),
 (3,'AUTOCAB','403','OperatorWeb',false,'Account',NULL,NULL,'CMAC CABX','CANCELLED',99),
 (4,'AUTOCAB','117','OperatorWeb',false,'Account','2019',NULL,NULL,'COMPLETED',200),
 (5,'AUTOCAB','499','OperatorWeb',false,'Cash','2019',NULL,NULL,'COMPLETED',300),
 (6,'AUTOCAB','499','OperatorWeb',false,'Account',NULL,NULL,'ACMAC unrelated','COMPLETED',400),
 (7,'AUTOCAB','499','OperatorWeb',false,'Account',NULL,NULL,'cmac cabx','COMPLETED',NULL),
 (8,'AUTOCAB','499','OperatorWeb',false,'Account',NULL,NULL,'CMAC','COMPLETED',0),
 (9,'AUTOCAB',NULL,'OperatorWeb',false,'Account','2019',NULL,NULL,'COMPLETED',500),
 (10,'AUTOCAB','499','OperatorWeb',false,'Account','22',NULL,NULL,'COMPLETED',600);`);
 const values=[];const e=hackneyExpressions(defaultHackneyPolicy,v=>{values.push(v);return '$'+values.length});
 const predicate=bookingGroupPredicate('hackney-cmac',e);
 const rows=await db.query(`SELECT id FROM "Booking" booking WHERE ${predicate} ORDER BY id`,values);
 assert.deepEqual(rows.rows.map(x=>x.id),[1,2,3,7,8]);
 const total=await db.query(`SELECT count(*)::int jobs,count(*)FILTER(WHERE status='COMPLETED')::int completed,coalesce(sum(price)FILTER(WHERE status='COMPLETED'),0)::text total,count(*)FILTER(WHERE status='COMPLETED' AND price IS NULL)::int missing FROM "Booking" booking WHERE ${predicate}`,values);
 assert.deepEqual(total.rows[0],{jobs:5,completed:4,total:'30.30',missing:1});
 const hackney=await db.query(`SELECT id FROM "Booking" booking WHERE ${e.hackney} ORDER BY id`,values);
 assert.equal(hackney.rows.some(x=>x.id===1),true);
 }finally{await db.close()}
});
