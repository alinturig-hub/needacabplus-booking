import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAuditBooking} from '../scripts/audit-reference.mjs';

test('404 falls back only to the explicit original booking ID',async()=>{
 const urls=[];
 const result=await readAuditBooking('14901249','13177442',{},async url=>{
  urls.push(url);if(url.endsWith('/14901249'))throw new Error('HTTP_404');
  return {archivedBooking:{originalAutoID:13177442}};
 });
 assert.equal(urls.length,2);assert.equal(result.lookupReference,'13177442');
 assert.equal(result.originalReferenceAttempted,'13177442');
});
test('no guessed fallback for missing, invalid or identical original IDs',async()=>{
 for(const original of [null,'','0','14901249','../123']){
  let calls=0;await assert.rejects(readAuditBooking('14901249',original,{},async()=>{calls++;throw new Error('HTTP_404')}),/HTTP_404/);
  assert.equal(calls,1);
 }
});
test('successful primary read and authentication failures never use fallback',async()=>{
 let calls=0;await readAuditBooking('14901249','13177442',{},async()=>{calls++;return {}});assert.equal(calls,1);
 calls=0;await assert.rejects(readAuditBooking('14901249','13177442',{},async()=>{calls++;throw new Error('STOP_HTTP_403')}),/STOP_HTTP_403/);assert.equal(calls,1);
});
test('failed original lookup records attempted reference and rejects mismatched identity',async()=>{
 for(const mismatch of [false,true]){
  await assert.rejects(readAuditBooking('14901249','13177442',{},async url=>{
   if(url.endsWith('/14901249')||!mismatch)throw new Error('HTTP_404');
   return {archivedBooking:{originalAutoID:999}};
  }),error=>error.originalReferenceAttempted==='13177442'&&error.message===(mismatch?'REFERENCE_MISMATCH':'HTTP_404'));
 }
});
