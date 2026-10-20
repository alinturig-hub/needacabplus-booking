import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('production dispatch queries exclude historical archive states from both jobs and active totals',async()=>{
 const source=readFileSync(new URL('../lib/taxicrm-dispatch.ts',import.meta.url),'utf8');
 const jobs=/const jobs=await client\.query<JobRow>\(`([\s\S]*?)`\)/.exec(source)?.[1];
 const count=/const count=await client\.query<\{total:string\}>\(`([\s\S]*?)`\)/.exec(source)?.[1];
 assert.ok(jobs);assert.ok(count);
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE public."Booking"(id text,"externalId" text,status text,"pickupDueTime" timestamptz,"updatedAt" timestamptz,"vehicleCallSign" text,"driverId" text,"vehicleId" text);CREATE TABLE public."BookingLocation"("bookingId" text,type text,address text);`);
 for(const [i,status] of ['CREATED','COMPLETED','CANCELLED','ARCHIVED_NO_JOB','ARCHIVED_DISPATCHED','ARCHIVED_REVIEW','ARCHIVED_SUSPENDED'].entries())await db.query('INSERT INTO public."Booking"(id,"externalId",status,"pickupDueTime","updatedAt") VALUES($1,$1,$2,now(),now())',[String(i),status]);
 assert.deepEqual((await db.query(jobs)).rows.map(r=>r.status),['CREATED']);
 assert.equal((await db.query(count)).rows[0].total,'1');
 }finally{await db.close()}
});
