import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultBookingPolicy} from '../lib/booking-policy';
import {simulateBookingRules} from '../lib/booking-rules-sandbox';
import {defaultQuotePolicy} from '../lib/quote-policy';

const policy={...defaultQuotePolicy,smartFareMode:'live' as const,membership:{...defaultQuotePolicy.membership,enabled:true,tiers:{...defaultQuotePolicy.membership.tiers,gold:{...defaultQuotePolicy.membership.tiers.gold,monthlyPrice:25,priorityAddonPercent:0,guaranteeAddonPercent:0}}}};
const input={service:'asap' as const,tierId:null,basePence:1500,candidatePence:1200,waiting:1,clear:8,miles:5};

test('sandbox keeps the standard ASAP fare for guests and applies the quiet discount to paid members',()=>{
 const guest=simulateBookingRules(defaultBookingPolicy,policy,input);
 const member=simulateBookingRules(defaultBookingPolicy,policy,{...input,tierId:'gold'});
 assert.equal(guest.allowed,true);
 assert.equal(guest.totalPence,1500);
 assert.equal(member.discountAvailable,true);
 assert.equal(member.totalPence,1200);
});

test('sandbox requires a paid tier for Priority and Guarantee',()=>{
 for(const service of ['priority','guarantee'] as const){
  assert.equal(simulateBookingRules(defaultBookingPolicy,policy,{...input,service}).allowed,false);
  assert.equal(simulateBookingRules(defaultBookingPolicy,policy,{...input,service,tierId:'gold'}).allowed,true);
 }
});

test('shadow Smart Fare does not lower the simulated fare',()=>{
 const result=simulateBookingRules(defaultBookingPolicy,{...policy,smartFareMode:'shadow'}, {...input,tierId:'gold'});
 assert.equal(result.discountAvailable,false);
 assert.equal(result.totalPence,1500);
});
