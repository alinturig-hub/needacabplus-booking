import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultQuotePolicy as defaults,quotePolicySchema,priorityPercent,fareBreakdown,validateSchedule,readFare} from '../lib/quote-policy.ts';
test('Priority uplift uses integer pence and predictable half-penny rounding',()=>{
 assert.deepEqual(fareBreakdown(1090,15),{basePence:1090,upliftPence:164,totalPence:1254});
 assert.equal(fareBreakdown(670,10).totalPence,737);
 assert.equal(fareBreakdown(670,20).totalPence,804);
 assert.equal(fareBreakdown(1000,defaults.guaranteePercent).totalPence,1200);
 assert.equal(fareBreakdown(670,0).totalPence,670);
});
test('automatic demand thresholds, empty supply and stale fallback',()=>{
 const p={...defaults,demandMode:'automatic',manualDemand:'medium'};
 assert.equal(priorityPercent(p,1,2).percent,10);
 assert.equal(priorityPercent(p,2,2).percent,15);
 assert.equal(priorityPercent(p,4,2).percent,20);
 assert.equal(priorityPercent(p,1,0).percent,20);
 assert.equal(priorityPercent(p,0,0).percent,10);
 assert.equal(priorityPercent(p,null,null).percent,15);
 assert.equal(priorityPercent({...p,demandMode:'manual'},100,1).percent,15);
});
test('prebook exact boundary, ASAP restriction and invalid dates',()=>{
 const now=Date.parse('2026-09-27T10:00:00Z');
 assert.doesNotThrow(()=>validateSchedule('guarantee','2026-09-27T10:30:00Z',30,now));
 assert.throws(()=>validateSchedule('guarantee','2026-09-27T10:29:59Z',30,now));
 assert.throws(()=>validateSchedule('guarantee',null,30,now));
 assert.throws(()=>validateSchedule('guarantee','invalid',30,now));
 assert.throws(()=>validateSchedule('priority','2026-09-27T10:30:00Z',30,now));
 assert.doesNotThrow(()=>validateSchedule('priority',null,30,now));
 assert.throws(()=>validateSchedule('guarantee','2026-09-27T10:30:00Z',60,now));
});
test('fare mapping never guesses cost or substitutes a demo fare',()=>{
 assert.equal(readFare({price:6.7,cost:4},'price','gbp'),670);
 assert.equal(readFare({Pricing:{Price:670}},'pricing.price','pence'),670);
 for(const payload of [{cost:6.7},{price:null},{price:-1},{price:0},{price:'£6.70'},{price:NaN},{price:Infinity},{price:10001}])assert.throws(()=>readFare(payload,'price','gbp'));
 assert.throws(()=>readFare({price:6.7},'price','pence'));
});
test('settings reject reversed thresholds, negative notice and unordered surcharges',()=>{
 assert.equal(quotePolicySchema.safeParse({...defaults,highPercent:5}).success,false);
 assert.equal(quotePolicySchema.safeParse({...defaults,highRatio:.5}).success,false);
 assert.equal(quotePolicySchema.safeParse({...defaults,minPrebookMinutes:0}).success,false);
 assert.equal(quotePolicySchema.safeParse({...defaults,highPercent:101}).success,false);
});
