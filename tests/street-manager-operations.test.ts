import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {loadDriverAlertHistory,parseAlertHistoryCursor} from '../lib/street-manager/alert-history';
import {adminMenuGroups} from '../app/admin/admin-menu';
test('read-only roadworks module is listed under Operations',()=>{
 const entry=adminMenuGroups.find(g=>g.id==='operations')?.items.find(i=>i.href==='/admin/roadworks');assert.ok(entry);assert.match(entry.label,/Roadworks/);
});
test('history cursor rejects malformed dates, IDs and injection strings',()=>{
 assert.equal(parseAlertHistoryCursor(null),null);
 for(const cursor of ['invalid',"'; DROP TABLE x; --",'x'.repeat(301),Buffer.from(JSON.stringify({at:'not-a-date',id:'bad'})).toString('base64url'),Buffer.from(JSON.stringify({at:'2026-11-09T12:00:00Z',id:randomUUID(),extra:true})).toString('base64url')])assert.throws(()=>parseAlertHistoryCursor(cursor));
});
test('history pages tied timestamps without duplicates, filters queue outcomes and excludes raw driver data',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(readFileSync('scripts/migrations/20261109_road_closure_alerts.sql','utf8'));
  await db.exec(`CREATE TABLE "Driver"(provider text,"externalId" text,callsign text,mobile text);CREATE TABLE "Vehicle"(provider text,"externalId" text,callsign text);INSERT INTO "Driver" VALUES('AUTOCAB','123','D-TEST','DO_NOT_EXPOSE');INSERT INTO "Vehicle" VALUES('AUTOCAB','456','V-TEST')`);
  for(let i=0;i<54;i++)await db.query(`INSERT INTO street_manager_driver_alerts(id,driver_id,vehicle_id,closure_key,alert_day,fix_at,message,distance_metres,status,outcome_code,http_status,created_at) VALUES($1,'123','456',$2,'2026-11-09',now(),'Synthetic closure warning',140,$3,$4,200,'2026-11-09T12:00:00Z')`,[randomUUID(),String(i),i<52?'ACCEPTED':'REJECTED',i<52?'QUEUED_FOR_VEHICLE':'NOT_QUEUED']);
  const client={query:(sql:string,parameters:unknown[])=>db.query(sql,parameters)} as unknown as Parameters<typeof loadDriverAlertHistory>[0];
  const first=await loadDriverAlertHistory(client);assert.equal(first.rows.length,50);assert.ok(first.nextCursor);
  const next=await loadDriverAlertHistory(client,{cursor:first.nextCursor});assert.equal(next.rows.length,4);assert.equal(next.nextCursor,null);assert.equal(new Set([...first.rows,...next.rows].map(r=>r.id)).size,54);
  assert.equal(first.rows[0].driverCallsign,'D-TEST');assert.equal(first.rows[0].vehicleCallsign,'V-TEST');assert.equal(JSON.stringify(first).includes('DO_NOT_EXPOSE'),false);
  const rejected=await loadDriverAlertHistory(client,{status:'REJECTED'});assert.equal(rejected.rows.length,2);assert.equal(rejected.rows[0].httpStatus,200);assert.equal(rejected.rows[0].outcomeCode,'NOT_QUEUED');
  await assert.rejects(loadDriverAlertHistory(client,{status:'unknown-filter'}));
 }finally{await db.close()}
});
