import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSandboxPayment,passengerPaymentSchema,passengerPaymentLabel} from '../lib/passenger-payment';
import {londonPickupIso,defaultPickupFields} from '../lib/pickup-schedule';
const expected={quoteId:'quote',customerId:'customer',stripeCustomerId:'cus_own',amount:1250};
const intent={id:'pi_test',status:'succeeded',livemode:false,amount:1250,currency:'gbp',customer:'cus_own',metadata:{quoteId:'quote',customerId:'customer',purpose:'booking_sandbox'}};
test('sandbox confirmation binds payment to exact fare, quote and customer and rejects real charges',()=>{
 assert.equal(assertSandboxPayment(intent,expected),'pi_test');
 for(const patch of [{status:'requires_action'},{livemode:true},{amount:1249},{currency:'usd'},{customer:'cus_other'},{metadata:{...intent.metadata,quoteId:'other'}},{metadata:{...intent.metadata,customerId:'other'}},{metadata:{...intent.metadata,purpose:'subscription'}}])assert.throws(()=>assertSandboxPayment({...intent,...patch},expected));
});
test('payment display never accepts arbitrary card data in the booking draft',()=>{
 assert.equal(passengerPaymentSchema.safeParse({kind:'saved_card',id:'pm_card',brand:'visa',last4:'4435'}).success,true);
 assert.equal(passengerPaymentSchema.safeParse({kind:'saved_card',id:'pm_card',brand:'visa',last4:'4435',number:'4242424242424242'}).success,false);
 assert.equal(passengerPaymentLabel({kind:'cash'}),'Cash');
 assert.equal(passengerPaymentLabel({kind:'google_pay'}),'Google Pay');
});
test('UK calendar resolves BST/GMT and rejects nonexistent clock-change time',()=>{
 const now=Date.parse('2026-03-28T00:00:00Z');
 assert.equal(londonPickupIso('2026-03-29','02:30',30,now),'2026-03-29T01:30:00.000Z');
 assert.throws(()=>londonPickupIso('2026-03-29','01:30',30,now));
 const autumn=Date.parse('2026-10-24T00:00:00Z');
 assert.equal(londonPickupIso('2026-10-25','01:30',30,autumn),'2026-10-25T00:30:00.000Z');
 assert.equal(londonPickupIso('2026-10-26','14:00',30,autumn),'2026-10-26T14:00:00.000Z');
});
test('calendar enforces operator notice, five-minute slots and 90-day horizon',()=>{
 const now=Date.parse('2026-10-18T09:00:00Z');
 assert.deepEqual(defaultPickupFields(45,now),{date:'2026-10-18',time:'10:45'});
 assert.throws(()=>londonPickupIso('2026-10-18','10:30',45,now));
 assert.throws(()=>londonPickupIso('2026-10-18','10:46',45,now));
 assert.throws(()=>londonPickupIso('2027-02-01','12:00',45,now));
});
