import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bookingPolicySchema} from '../lib/booking-policy.ts';
import {enabledPaymentMethods,selectPaymentMethod,validateBookingPayment} from '../lib/booking-payments.ts';
import {buildLiveCashBookingRequest} from '../lib/autocab-booking-request.ts';
const rules=overrides=>bookingPolicySchema.parse(overrides);
test('cash and card independently permit both, one or neither',()=>{
 for(const cashEnabled of [false,true])for(const cardEnabled of [false,true]){
  const p=rules({cashEnabled,cardEnabled});assert.deepEqual(enabledPaymentMethods(p),[...(cashEnabled?['cash']:[]),...(cardEnabled?['card']:[])]);
  for(const method of ['cash','card']){if(p[method+'Enabled'])assert.equal(selectPaymentMethod(p,method),method);else assert.throws(()=>selectPaymentMethod(p,method));}
  if(!cashEnabled&&!cardEnabled)assert.throws(()=>selectPaymentMethod(p));
 }
 assert.equal(selectPaymentMethod(rules({cardEnabled:false})),'cash');
});
test('confirmation rejects a disabled method and changed mode even for an old quote',()=>{
 assert.throws(()=>validateBookingPayment(rules({cashEnabled:false}),'cash',false),/no longer/);
 assert.throws(()=>validateBookingPayment(rules({liveBookingsEnabled:true}),'cash',false),/changed/);
 assert.throws(()=>validateBookingPayment(rules({liveBookingsEnabled:false}),'cash',true),/changed/);
 assert.throws(()=>validateBookingPayment(rules({liveBookingsEnabled:true}),'card',true),/not available/);
 assert.doesNotThrow(()=>validateBookingPayment(rules({liveBookingsEnabled:true}),'cash',true));
});
test('live cash payload is dispatchable, preserves quote costs and excludes a card account',()=>{
 const now=new Date(),due=new Date(now.getTime()+3600000).toISOString();
 const quote={id:'cash-test',paymentMethod:'cash',liveBooking:true,service:'guarantee',scheduledAt:due,totalPence:1250,expiresAt:new Date(now.getTime()+60000).toISOString(),autocabCosts:{cost:8,bookingCost:7},autocabRequest:{companyId:1,capabilities:[9],passengers:'4',pickup:{address:{text:'Station'},type:'Pickup'},destination:{address:{text:'Home'},type:'Destination'},vias:[],driverConstraints:{},vehicleConstraints:{}}};
 const details={name:'Test Passenger',telephoneNumber:'+447000000000',customerEmail:'test@example.invalid',passengers:2,luggage:1,driverNote:'Entrance'};
 const body=buildLiveCashBookingRequest(quote,details,now);assert.equal(body.hold,false);assert.equal(body.pickupDueTimeUtc,due);assert.equal(body.customerId,undefined);assert.equal(body.passengers,'2');assert.equal(body.pricing.cost,8);assert.equal(body.pricing.bookingCost,7);assert.equal(body.pricing.price,12.5);assert.deepEqual(body.capabilities,[9]);
 assert.throws(()=>buildLiveCashBookingRequest({...quote,paymentMethod:'card'},details,now));assert.throws(()=>buildLiveCashBookingRequest({...quote,liveBooking:false},details,now));
});
