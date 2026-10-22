import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {hackneyPeriodPredicate,hackneyBookingHref} from '../lib/hackney-period.mjs';
import * as policy from '../lib/hackney-policy.mjs';
function loadTs(path,dependencies={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(!(id in dependencies))throw Error('Unexpected import '+id);return dependencies[id]},mod,mod.exports);return mod.exports}
const {bookingPeriod}=loadTs('lib/booking-period.ts');
test('UK yesterday, inclusive 30 calendar days and DST date boundaries',()=>{
 const now=new Date('2026-03-31T23:30:00Z');
 assert.deepEqual(bookingPeriod(new URLSearchParams('period=yesterday'),now),{period:'yesterday',start:'2026-03-31',end:'2026-03-31'});
 assert.deepEqual(bookingPeriod(new URLSearchParams('period=30days'),now),{period:'30days',start:'2026-03-03',end:'2026-04-01'});
 assert.deepEqual(bookingPeriod(new URLSearchParams('period=7days'),now),{period:'7days',start:'2026-03-26',end:'2026-04-01'});
 for(const query of ['period=invalid','period=custom&from=2026-02-30&to=2026-03-01','period=custom&from=2026-10-22&to=2026-10-21'])assert.throws(()=>bookingPeriod(new URLSearchParams(query),now));
 const href=new URL(hackneyBookingHref('hackney-cmac',{period:'custom',from:'2026-10-01',to:'2026-10-22'}),'https://example.test');
 assert.equal(href.searchParams.get('group'),'hackney-cmac');assert.equal(href.searchParams.get('from'),'2026-10-01');assert.equal(href.searchParams.get('to'),'2026-10-22');
});
test('canonical period predicate includes last second, excludes next midnight and handles 23/25-hour UK days',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE TABLE "Booking"(id int,"pickupDueTime" timestamp);');
 for(const [date,start,end,hours] of [['2026-03-29','2026-03-29T00:00:00','2026-03-29T23:00:00',23],['2026-10-25','2026-10-24T23:00:00','2026-10-26T00:00:00',25]]){
  await db.exec('TRUNCATE "Booking"');
  await db.query('INSERT INTO "Booking" VALUES(1,$1::timestamp-interval \'1 millisecond\'),(2,$1::timestamp),(3,$2::timestamp-interval \'1 millisecond\'),(4,$2::timestamp),(5,NULL)',[start,end]);
  const values=[];const predicate=hackneyPeriodPredicate(bookingPeriod(new URLSearchParams({period:'custom',from:date,to:date})),v=>{values.push(v);return '$'+values.length});
  assert.deepEqual((await db.query(`SELECT id FROM "Booking" booking WHERE ${predicate} ORDER BY id`,values)).rows.map(x=>x.id),[2,3]);
  assert.equal((Date.parse(end+'Z')-Date.parse(start+'Z'))/3600000,hours);
 }
 assert.equal(hackneyPeriodPredicate({period:'all'},()=>{throw Error('should not bind dates')}),'true');
 }finally{await db.close()}
});
test('Hackney API filters every card including CMAC value, and rejects invalid ranges',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "AutocabAccount"(provider text,"externalId" text,"displayName" text,"accountCode" text);
 CREATE TABLE "Booking"(provider text,"driverCallSign" text,"bookingSource" text,"isStreetPickup" boolean,"paymentType" text,"accountName" text,"accountCode" text,"accountId" text,status text,price numeric,"pickupDueTime" timestamp);
 INSERT INTO "Booking" VALUES
 ('AUTOCAB','401','OperatorWeb',false,'Account','CMAC',NULL,NULL,'COMPLETED',10,'2026-10-21T23:00:00'),
 ('AUTOCAB','901','FlaggedBooking',false,'Account','CMAC',NULL,NULL,'COMPLETED',20,'2026-10-22T22:59:59.999'),
 ('AUTOCAB','402','FlaggedBooking',false,'Account','CMAC',NULL,NULL,'COMPLETED',100,'2026-10-21T22:59:59.999'),
 ('AUTOCAB','403','OperatorWeb',false,'Account','CMAC',NULL,NULL,'COMPLETED',200,'2026-10-22T23:00:00'),
 ('AUTOCAB',NULL,'OperatorWeb',false,'Cash',NULL,NULL,NULL,'BOOKED',30,'2026-10-22T12:00:00');`);
 const route=loadTs('app/api/admin/hackney/route.ts',{
 '@/lib/database':{},'@/lib/security':{isAdmin:async()=>true,sameOrigin:()=>true},
 '@/lib/taxicrm-database':{withTaxiCrmReadOnly:async work=>work(db)},
 '@/lib/hackney':{loadHackneyPolicy:async()=>policy.defaultHackneyPolicy},'@/lib/hackney-policy.mjs':policy,
 '@/lib/booking-period':{bookingPeriod:params=>bookingPeriod(params,new Date('2026-10-22T12:00:00Z'))},
 '@/lib/hackney-period.mjs':{hackneyPeriodPredicate},
 });
 for(const [period,expectedJobs,expectedValue] of [['today',2,'30'],['yesterday',1,'100'],['7days',3,'130'],['30days',3,'130'],['all',4,'330']]){
  const response=await route.GET(new Request('https://example.test/api/admin/hackney?period='+period));const body=await response.json();assert.equal(response.status,200);
  assert.equal(body.summary.hackney,expectedJobs);assert.equal(body.summary.cmac_jobs,expectedJobs);assert.equal(body.summary.cmac_completed_value,expectedValue);
  if(period==='today'){assert.equal(body.summary.street,1);assert.equal(body.summary.unknown_driver,1)}
 }
 const custom=await(await route.GET(new Request('https://example.test/api/admin/hackney?period=custom&from=2026-10-22&to=2026-10-22'))).json();assert.equal(custom.summary.cmac_completed_value,'30');
 assert.equal((await route.GET(new Request('https://example.test/api/admin/hackney?period=custom&from=bad&to=2026-10-22'))).status,400);
 }finally{await db.close()}
});
