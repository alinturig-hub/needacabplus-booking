import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildAutocabBookingRequest,readAutocabCosts,bookingCreateUrl} from '../lib/autocab-booking-request.ts';
import {buildAutocabQuoteRequest} from '../lib/autocab-quote-request.ts';
const now=new Date('2026-09-27T14:00:00Z');
const place=id=>({id:String(id),text:`Public address ${id}`,coordinate:{latitude:50.37,longitude:-4.14},zoneId:id,zone:{id}});
const passenger={name:'Test Passenger',telephoneNumber:'+44000000000',customerEmail:'test@example.invalid',passengers:2,luggage:1,driverNote:'Main entrance'};
const quote=()=>({id:'123',service:'priority',scheduledAt:null,totalPence:1200,expiresAt:'2026-09-27T14:03:00Z',autocabCosts:{cost:7.35,bookingCost:7.10},autocabRequest:buildAutocabQuoteRequest({pickup:place(1),destination:place(4),vias:[place(2),place(3)],vehicle:'saloon',scheduledAt:null},[4,5],new Date('2026-09-27T13:59:00Z'))});
test('fixed passenger price includes markup while independent operator costs remain unchanged',()=>{
 const q=quote(),body=buildAutocabBookingRequest(q,passenger,now);
 assert.deepEqual(body.pricing,{cost:7.35,bookingCost:7.10,price:12,bookingPrice:12,isManual:true,pricingTariff:'Manually Entered'});
 assert.equal(body.passengers,'2');assert.equal(body.luggage,1);assert.equal(body.hold,true);
 assert.equal(body.bookingSource,'ThirdPartyWebsite');assert.equal(body.companyId,1);
 assert.equal(body.ourReference,'NAC-123');assert.deepEqual(body.capabilities,[4,5]);
 assert.deepEqual(body.vias.map(v=>v.address.zoneId),[2,3]);assert.deepEqual(body.pickup,q.autocabRequest.pickup);
 for(const field of ['customerId','returnTime','returnTimeUtc','priorityOverride','yourReferences'])assert.equal(field in body,false);
 assert.equal(body.pickupDueTimeUtc,now.toISOString());
 body.pickup.address.zoneId=99;assert.equal(q.autocabRequest.pickup.address.zoneId,1);
});
test('prebook time survives unchanged and invalid passenger counts or expired quotes are rejected',()=>{
 const q={...quote(),service:'guarantee',scheduledAt:'2026-10-25T02:30:00.000Z'};
 assert.equal(buildAutocabBookingRequest(q,passenger,now).pickupDueTimeUtc,q.scheduledAt);
 assert.throws(()=>buildAutocabBookingRequest(q,{...passenger,passengers:5},now),/capacity/);
 assert.throws(()=>buildAutocabBookingRequest({...q,expiresAt:now.toISOString()},passenger,now),/expired/);
 assert.throws(()=>buildAutocabBookingRequest({...q,autocabCosts:undefined},passenger,now),/verified Autocab cost/);
});
test('cost mapping does not replace a missing cost with price, base fare or guessed values',()=>{
 assert.deepEqual(readAutocabCosts({outward:{price:10,cost:0,bookingCost:0}}),{cost:0,bookingCost:0});
 for(const outward of [{price:10},{cost:5},{cost:'5',bookingCost:5},{cost:-1,bookingCost:5}])assert.equal(readAutocabCosts({outward}),undefined);
});
test('booking transport validates the documented path and never overrides warnings',()=>{
 assert.equal(bookingCreateUrl('https://autocab-api.azure-api.net','/booking/v1/booking?override=true','POST').href,'https://autocab-api.azure-api.net/booking/v1/booking');
 assert.throws(()=>bookingCreateUrl('https://autocab-api.azure-api.net','/booking/v1/quote','POST'));
 assert.throws(()=>bookingCreateUrl('https://autocab-api.azure-api.net','/booking/v1/booking','GET'));
});

test('configured account, capabilities and Priority delay carry through quote and booking',()=>{
 const rules={companyId:1,accountCustomerId:2155,cashAccountCustomerId:null,paymentMethod:'card',priorityDelayMinutes:7};
 const request=buildAutocabQuoteRequest({pickup:place(1),destination:place(4),vias:[],vehicle:'saloon',scheduledAt:null},[4,9,9],now,rules);
 assert.equal(request.customerId,2155);assert.deepEqual(request.capabilities,[4,9]);assert.equal(request.pickupDueTimeUtc,'2026-09-27T14:07:00.000Z');
 const body=buildAutocabBookingRequest({...quote(),autocabRequest:request,bookingRules:rules,paymentMethod:'card'},passenger,now);
 assert.equal(body.customerId,2155);assert.equal(body.pickupDueTimeUtc,request.pickupDueTimeUtc);assert.equal(body.yourReferences.yourReference1,'NAC-123');assert.equal(body.hold,true);
 const cash=buildAutocabQuoteRequest({pickup:place(1),destination:place(4),vias:[],vehicle:'saloon',scheduledAt:'2026-09-28T10:00:00Z'},[],now,{...rules,paymentMethod:'cash'});
 assert.equal('customerId' in cash,false);assert.equal(cash.pickupDueTimeUtc,'2026-09-28T10:00:00Z');
});

test('configured account ID and common capabilities reach quote and booking; account labels stay local',async()=>{
 const {bookingPolicySchema}=await import('../lib/booking-policy.ts');
 const rules=bookingPolicySchema.parse({accountName:'Web Booker Card',accountCustomerId:2155,bookingCapabilities:[4,9],priorityCapabilities:[5]});
 const request=buildAutocabQuoteRequest({pickup:place(1),destination:place(2),vias:[],vehicle:'saloon',scheduledAt:null},[4,5],now,rules);
 assert.equal(request.customerId,2155);assert.deepEqual(request.capabilities,[4,9,5]);assert.equal('accountName' in request,false);
 const body=buildAutocabBookingRequest({...quote(),autocabRequest:request,bookingRules:rules},passenger,now);
 assert.equal(body.customerId,2155);assert.deepEqual(body.capabilities,[4,9,5]);assert.equal('accountName' in body,false);
 const cash=buildAutocabQuoteRequest({pickup:place(1),destination:place(2),vias:[],vehicle:'saloon',scheduledAt:null},[],now,{...rules,paymentMethod:'cash',cashAccountCustomerId:222});assert.equal(cash.customerId,222);
});
