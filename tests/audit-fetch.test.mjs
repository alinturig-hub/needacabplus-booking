import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchAuditBooking} from '../scripts/audit-fetch.mjs';
test('rate limits respect bounded retry-after and resume the same request',async()=>{
 let calls=0;const waits=[];
 const payload=await fetchAuditBooking('https://example.test',{}, {integrationCheck:async()=>{},fetcher:async()=>++calls===1?new Response('',{status:429,headers:{'Retry-After':'999'}}):Response.json({capabilities:[]}),sleep:async ms=>waits.push(ms)});
 assert.deepEqual(payload,{capabilities:[]});assert.deepEqual(waits,[60000]);assert.equal(calls,2);
});
test('missing archived booking is an explicit 404, not an endless retry',async()=>{
 let calls=0;await assert.rejects(fetchAuditBooking('https://example.test',{}, {integrationCheck:async()=>{},fetcher:async()=>{calls++;return new Response('',{status:404})},sleep:async()=>{}}),/HTTP_404/);assert.equal(calls,1);
});
test('network failure is bounded to three attempts and reports its category',async()=>{
 let calls=0;await assert.rejects(fetchAuditBooking('https://example.test',{}, {integrationCheck:async()=>{},fetcher:async()=>{calls++;throw new TypeError('fetch failed')},sleep:async()=>{}}),/NETWORK_ERROR/);assert.equal(calls,3);
});
test('authentication stops immediately without marking a booking checked',async()=>{
 await assert.rejects(fetchAuditBooking('https://example.test',{}, {integrationCheck:async()=>{},fetcher:async()=>new Response('',{status:403}),sleep:async()=>assert.fail()}),/STOP_HTTP_403/);
});

test('disabled integration prevents the audit HTTP call without retries',async()=>{let calls=0;await assert.rejects(fetchAuditBooking('https://example.test',{}, {integrationCheck:async()=>{throw Error('Autocab disabled')},fetcher:async()=>{calls++;return Response.json({})},sleep:async()=>assert.fail()}),/Autocab disabled/);assert.equal(calls,0)});
