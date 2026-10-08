import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultQuotePolicy as defaults,quotePolicySchema,dynamicScheduleActive,priorityPercent,fareAdjustment,fareBreakdown,membershipAddonPercent,validateSchedule,readFare} from '../lib/quote-policy.ts';
import {firstPrebookTime,isPrebookInterval} from '../lib/prebook-time.js';
test('Priority uplift uses integer pence and predictable half-penny rounding',()=>{
 assert.deepEqual(fareBreakdown(1090,15),{basePence:1090,upliftPence:164,totalPence:1254});
 assert.equal(fareBreakdown(670,10).totalPence,737);
 assert.equal(fareBreakdown(670,20).totalPence,804);
 assert.equal(fareBreakdown(1000,defaults.guaranteePercent).totalPence,1200);
 assert.equal(fareBreakdown(670,0).totalPence,670);
});
test('dynamic pricing activates only when bookings exceed CLEAR cars',()=>{
 const p={...defaults,dynamicPricingEnabled:true,lowPercent:10,demandPercent:25};
 assert.deepEqual(priorityPercent(p,1,2),{level:'base',percent:10});
 assert.deepEqual(priorityPercent(p,2,2),{level:'base',percent:10});
 assert.deepEqual(priorityPercent(p,3,2),{level:'demand',percent:25});
 assert.deepEqual(priorityPercent(p,1,0),{level:'demand',percent:25});
 assert.deepEqual(priorityPercent(p,0,0),{level:'base',percent:10});
 assert.deepEqual(priorityPercent(p,null,null),{level:'base',percent:10});
 assert.deepEqual(priorityPercent({...p,dynamicPricingEnabled:false},100,1),{level:'base',percent:10});
});
test('dynamic pricing schedule uses UK days and supports overnight windows',()=>{
 const weekday={...defaults,dynamicPricingEnabled:true,dynamicScheduleEnabled:true,dynamicDays:[1],dynamicStartTime:'17:00',dynamicEndTime:'23:00'};
 assert.equal(dynamicScheduleActive(weekday,new Date('2026-09-28T18:00:00Z')),true);
 assert.equal(dynamicScheduleActive(weekday,new Date('2026-09-28T10:00:00Z')),false);
 assert.equal(dynamicScheduleActive({...weekday,dynamicStartTime:'22:00',dynamicEndTime:'04:00'},new Date('2026-09-28T23:00:00Z')),true);
 assert.equal(dynamicScheduleActive({...weekday,dynamicStartTime:'22:00',dynamicEndTime:'04:00'},new Date('2026-09-29T02:00:00Z')),true);
});
test('prebook exact boundary, ASAP restriction and invalid dates',()=>{
 const now=Date.parse('2026-09-27T10:00:00Z');
 assert.doesNotThrow(()=>validateSchedule('prebook','2026-09-27T10:30:00Z',30,now));
 assert.throws(()=>validateSchedule('prebook','2026-09-27T10:29:59Z',30,now));
 assert.throws(()=>validateSchedule('prebook',null,30,now));
 assert.doesNotThrow(()=>validateSchedule('guarantee','2026-09-27T10:30:00Z',30,now));
 assert.throws(()=>validateSchedule('guarantee','2026-09-27T10:29:59Z',30,now));
 assert.throws(()=>validateSchedule('guarantee',null,30,now));
 assert.throws(()=>validateSchedule('guarantee','invalid',30,now));
 assert.throws(()=>validateSchedule('priority','2026-09-27T10:30:00Z',30,now));
 assert.doesNotThrow(()=>validateSchedule('priority',null,30,now));
 assert.throws(()=>validateSchedule('guarantee','2026-09-27T10:30:00Z',60,now));
 assert.throws(()=>validateSchedule('guarantee','2026-09-27T10:31:00Z',30,now));
 assert.throws(()=>validateSchedule('guarantee','2026-09-27T10:30:01Z',30,now));
 assert.equal(isPrebookInterval(Date.parse('2026-09-27T10:35:00Z')),true);
 assert.equal(isPrebookInterval(Date.parse('2026-09-27T10:36:00Z')),false);
 assert.equal(firstPrebookTime(45,Date.parse('2026-10-06T08:00:00Z')),Date.parse('2026-10-06T08:45:00Z'));
 assert.equal(firstPrebookTime(45,Date.parse('2026-10-06T08:00:01Z')),Date.parse('2026-10-06T08:50:00Z'));
});
test('fare mapping never guesses cost or substitutes a demo fare',()=>{
 assert.equal(readFare({price:6.7,cost:4},'price','gbp'),670);
 assert.equal(readFare({outward:{price:6.7,cost:4},return:null},defaults.pricePath,defaults.priceUnit),670);
 assert.equal(readFare({Pricing:{Price:670}},'pricing.price','pence'),670);
 for(const payload of [{cost:6.7},{price:null},{price:-1},{price:0},{price:'£6.70'},{price:NaN},{price:Infinity},{price:10001}])assert.throws(()=>readFare(payload,'price','gbp'));
 assert.throws(()=>readFare({price:6.7},'price','pence'));
});
test('settings reject reversed thresholds, negative notice and unordered surcharges',()=>{
 assert.equal(quotePolicySchema.safeParse({...defaults,highPercent:5}).success,false);
 assert.equal(quotePolicySchema.safeParse({...defaults,highRatio:.5}).success,false);
 assert.equal(quotePolicySchema.safeParse({...defaults,minPrebookMinutes:0}).success,false);
 assert.equal(quotePolicySchema.safeParse({...defaults,highPercent:101}).success,false);
 assert.equal(quotePolicySchema.safeParse({...defaults,lowPercent:25,demandPercent:20}).success,false);
});

test('saved three-service settings migrate safely to the four-service structure',()=>{
 const migrated=quotePolicySchema.parse({serviceCapabilities:{asap:[],priority:[9],guarantee:[11]}});
 assert.deepEqual(migrated.serviceCapabilities.prebook,[]);
 assert.equal(migrated.prebookPercent,0);
 assert.equal(migrated.prebookFixedAmount,0);
});

test('fixed addition is exclusive and defaults to zero',()=>{
 assert.equal(defaults.priorityFixedAmount,0);assert.equal(defaults.prebookFixedAmount,0);assert.equal(defaults.guaranteeFixedAmount,0);
 assert.throws(()=>fareBreakdown(1000,20,150));
 assert.equal(fareBreakdown(1090,0,125).totalPence,1215);
 assert.equal(fareBreakdown(1000,0,250).totalPence,1250);
 const parsed=quotePolicySchema.parse({priorityFixedAmount:1.25,prebookFixedAmount:1,guaranteeFixedAmount:2.50});
 assert.equal(parsed.prebookFixedAmount,1);assert.equal(parsed.guaranteeFixedAmount,2.5);
 for(const amount of [-1,1.001,1001,Infinity])assert.equal(quotePolicySchema.safeParse({priorityFixedAmount:amount}).success,false);
 for(const amount of [-1,0.5,NaN,Infinity])assert.throws(()=>fareBreakdown(1000,20,amount));
});

test('service modes ignore inactive amounts and do not combine charges',()=>{
 const p={...defaults,priorityFixedAmount:1.5,prebookFixedAmount:1,guaranteeFixedAmount:2};
 assert.deepEqual(fareAdjustment({...p,dynamicPricingEnabled:true,demandPercent:20},'priority',4,1),{percent:20,fixedPence:0,demand:'demand'});
 assert.deepEqual(fareAdjustment({...p,priorityUpliftMode:'fixed'},'priority',4,1),{percent:0,fixedPence:150,demand:'fixed'});
 assert.deepEqual(fareAdjustment(p,'prebook',null,null),{percent:0,fixedPence:0,demand:'prebook'});
 assert.deepEqual(fareAdjustment({...p,prebookUpliftMode:'fixed'},'prebook',null,null),{percent:0,fixedPence:100,demand:'fixed'});
 assert.deepEqual(fareAdjustment(p,'guarantee',null,null),{percent:20,fixedPence:0,demand:'guarantee'});
 assert.deepEqual(fareAdjustment({...p,guaranteeUpliftMode:'fixed'},'guarantee',null,null),{percent:0,fixedPence:200,demand:'fixed'});
 assert.equal(quotePolicySchema.safeParse({priorityUpliftMode:'both'}).success,false);
});
test('paid membership uses a final service addon without changing NOW Smart Fare',()=>{
 const policy=quotePolicySchema.parse({...defaults,membership:{...defaults.membership,enabled:true,tiers:{...defaults.membership.tiers,silver:{...defaults.membership.tiers.silver,priorityAddonPercent:10,guaranteeAddonPercent:5}}}});
 assert.equal(membershipAddonPercent(policy,'silver','priority'),10);
 assert.equal(membershipAddonPercent(policy,'silver','guarantee'),5);
 assert.equal(membershipAddonPercent(policy,'silver','asap'),null);
 assert.equal(membershipAddonPercent(policy,null,'priority'),null);
 assert.equal(membershipAddonPercent({...policy,membership:{...policy.membership,enabled:false}},'silver','priority'),null);
});
