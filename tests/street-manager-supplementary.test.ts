import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {councilDates,parseCouncilNotices} from '../lib/street-manager/council';
import {importPlymouthArchive,syncPlymouthCouncil} from '../lib/street-manager/supplementary-sync';
import {loadStreetPreview} from '../lib/street-manager/preview-data';
import {councilPreviewItem} from '../lib/street-manager/supplementary-view';
const html=Array.from({length:10},(_,i)=>`<h3 id="street-${i}">Example Road ${i}</h3><p><strong>Dates</strong>: 1 November to 13 November 2026</p><p><strong>Traffic Management</strong>: Multiway signals</p><p><strong>Contractor</strong>: Example utility</p>`).join('');
test('council dates retain calendar precision and reject invalid dates',()=>{
 assert.deepEqual(councilDates('29 December to 3 January 2027'),{startDate:'2026-12-29',endDate:'2027-01-03'});
 assert.deepEqual(councilDates('9 November 2026'),{startDate:'2026-11-09',endDate:'2026-11-09'});
 assert.throws(()=>councilDates('31 February 2026'));assert.throws(()=>councilDates('9 November'));
 const first=parseCouncilNotices(html),extension=parseCouncilNotices(html.replaceAll('13 November','14 November'));
 assert.equal(first.length,10);assert.equal(first[0].id,extension[0].id);assert.notEqual(first[0].contentHash,extension[0].contentHash);
 assert.throws(()=>parseCouncilNotices('<h3>Broken page</h3>'));
 const item=councilPreviewItem({id:first[0].id,notice_data:first[0],geometry:null,location_quality:'unmapped',location_basis:null,source_checked_at:'2026-11-09T10:00:00Z'},Date.parse('2026-11-09T12:00:00Z'));
 assert.equal(item.state,'unknown');assert.equal(item.traffic,'Multiway signals');assert.equal(item.geometry,null);assert.ok(item.warnings.some(w=>w.includes('excluded')));
});
test('archive import is idempotent and never inserts unsigned data in the SNS inbox; council failure preserves last good snapshot',async()=>{
 const db=new PGlite();const query=(sql:string,values?:unknown[])=>db.query(sql,values);const client={query} as unknown as Parameters<typeof importPlymouthArchive>[0];
 const original=globalThis.fetch;
 try{
  await db.exec(readFileSync('scripts/migrations/20261108_street_manager_inbox.sql','utf8'));
  const migration=readFileSync('scripts/migrations/20261109_street_manager_supplementary.sql','utf8');await db.exec(migration);await db.exec(migration);
  assert.equal((await importPlymouthArchive(client)).imported,238);assert.equal((await importPlymouthArchive(client)).imported,0);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM street_manager_events')).rows[0].count,0);
  const preview=await loadStreetPreview(client);assert.ok(preview.items.some(i=>i.source==='archive'));assert.ok(preview.items.filter(i=>i.source==='archive').every(i=>i.state==='unknown'));
  // Empty response is rejected before replacing the previous inventory.
  const notice=parseCouncilNotices(html)[0];
  await db.query('INSERT INTO street_manager_council_notices(id,notice_data) VALUES($1,$2)',[notice.id,JSON.stringify(notice)]);
  globalThis.fetch=async()=>new Response('<h3>Temporarily broken upstream page</h3>',{status:200});
  assert.equal((await syncPlymouthCouncil(client)).status,'error');
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM street_manager_council_notices WHERE in_current_snapshot')).rows[0].count,1);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM street_manager_events')).rows[0].count,0);
 }finally{globalThis.fetch=original;await db.close()}
});
