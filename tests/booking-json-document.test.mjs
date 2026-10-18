import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webhookDocument,mergeDocument,documentTimestamp} from '../lib/autocab/booking-json-document.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
test('Search-compatible financial keys preserve zero, null and unknown nested fields',()=>{
 const payload={BookingId:12,BookingType:'Active',TypeOfBooking:'ASAP',Company:{Id:4},Pricing:{Price:0,Cost:12.50,FixedPrice:null,DriverCommissionFee:2.5,FutureField:{unchanged:['a']}},FutureExtension:{NestedUnknown:9}};
 const d=webhookDocument(payload,'12');
 assert.equal(d.id,'12');assert.equal(d.bookingType,'ASAP');assert.equal(d.webhookBookingType,'Active');assert.equal(d.companyId,4);
 assert.deepEqual(plain(d.pricing),{price:0,cost:12.5,fixedPrice:null,driverCommissionFee:2.5,FutureField:{unchanged:['a']}});
 assert.deepEqual(plain(d.FutureExtension),payload.FutureExtension);
 assert.equal(payload.Pricing.Price,0);
});
test('partial pricing and address updates retain fields absent from newer events',()=>{
 const full=webhookDocument({BookingId:1,Pickup:{Address:'Station',Coordinates:{Latitude:50.3,Longitude:-4.1},Zone:{Id:1}},Pricing:{Price:12,Cost:9,Future:'keep'},Vias:[{Address:'Stop'}]},'1');
 const changed=webhookDocument({BookingId:1,Pricing:{Price:0},Pickup:{Note:'Front door'}},'1');
 const doc=mergeDocument(full,changed);
 assert.deepEqual(plain(doc.pricing),{price:0,cost:9,Future:'keep'});
 assert.equal(doc.pickup.address.text,'Station');assert.equal(doc.pickup.address.coordinate.latitude,50.3);assert.equal(doc.pickup.note,'Front door');
 assert.equal(doc.vias[0].address.text,'Stop');
});
test('explicit nulls and empty arrays clear only the supplied fields',()=>{
 const initial={pricing:{price:20,cost:10},vias:[{id:2}],pickup:{address:{text:'Old'}}};
 const cleared=mergeDocument(initial,{pricing:null,vias:[],pickup:null});
 assert.deepEqual(plain(cleared),{pricing:null,vias:[],pickup:null});
 const delayed=mergeDocument(cleared,initial,true);
 assert.deepEqual(plain(delayed),plain(cleared));
});
test('delayed event fills absent details but cannot replace newer amounts, nulls or arrays',()=>{
 const newer={pricing:{price:30,cost:null},vias:[],name:'New'};
 const older={pricing:{price:5,cost:2,tax:1},vias:[{id:1}],name:'Old',UnknownField:true};
 assert.deepEqual(plain(mergeDocument(newer,older,true)),{pricing:{price:30,cost:null,tax:1},vias:[],name:'New',UnknownField:true});
});
test('original lifecycle dates are retained; no invented archived completion reason',()=>{
 const d=webhookDocument({BookingId:1,CompletedAtTime:'2026-10-18T22:00:00+01:00'},'1');
 assert.equal(d.archivedBooking.completedAtTime,'2026-10-18T22:00:00+01:00');assert.equal(d.archivedBooking.reason,undefined);
 assert.equal(documentTimestamp(d.archivedBooking.completedAtTime),'2026-10-18T21:00:00.000Z');
});
test('UK webhook wall times respect DST; ambiguous wall times remain unconverted',()=>{
 const d=webhookDocument({BookingId:1,PickupDueTime:'2026-10-18T22:00:00'},'1');assert.equal(d.pickupDueTimeUtc,'2026-10-18T21:00:00.000Z');
 assert.equal(documentTimestamp('2026-10-25T01:30:00'),null);
});
test('unknown prototype-like keys survive without modifying prototypes',()=>{
 const d=webhookDocument(JSON.parse('{"BookingId":1,"__proto__":{"poison":true}}'),'1');
 assert.deepEqual(plain(d).__proto__,{poison:true});assert.equal({}.poison,undefined);
});
