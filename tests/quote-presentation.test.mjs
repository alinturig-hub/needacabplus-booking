import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicFareQuote} from '../lib/quote-presentation.ts';
import {buildAutocabQuoteRequest} from '../lib/autocab-quote-request.ts';
test('passenger response contains only final price, never internal markup or Autocab request',()=>{
 const value=publicFareQuote({id:'id',vehicle:'saloon',service:'priority',scheduledAt:null,pickup:'Station',destination:'Library',vias:[],totalPence:1200,basePence:1000,upliftPence:200,percent:20,demand:'high',currency:'GBP',expiresAt:'later',autocabRequest:{capabilities:[9]}});
 assert.equal(value.totalPence,1200);
 for(const field of ['basePence','upliftPence','percent','demand','autocabRequest','autocabCosts'])assert.equal(field in value,false);
});
test('Autocab payload preserves address coordinates, zone, via order, capability IDs and UTC schedule',()=>{
 const place=id=>({text:`Public place ${id}`,coordinate:{latitude:50+id/100,longitude:-4},zoneId:id,zone:{id},id:String(id)});
 const input={pickup:place(1),destination:place(4),vias:[place(2),place(3)],vehicle:'xl',scheduledAt:'2026-10-25T02:30:00.000Z'};
 const body=buildAutocabQuoteRequest(input,[7,9,7]);
 assert.equal(body.companyId,1);assert.deepEqual(body.capabilities,[7,9]);assert.equal(body.passengers,'6');
 assert.deepEqual(body.pickup.address,input.pickup);assert.equal(body.pickup.type,'Pickup');assert.equal(body.destination.type,'Destination');
 assert.deepEqual(body.vias.map(v=>v.address.zoneId),[2,3]);assert.ok(body.vias.every(v=>v.type==='Via'));
 assert.equal(body.pickupDueTimeUtc,input.scheduledAt);assert.equal(body.pickupDueTime,input.scheduledAt);
 input.pickup.zoneId=999;assert.equal(body.pickup.address.zoneId,1);
 assert.equal('price' in body,false);assert.equal('telephoneNumber' in body,false);
});
