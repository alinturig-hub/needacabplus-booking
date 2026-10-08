import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultQuotePolicy} from '../lib/quote-policy.ts';
import {membershipMessage,paymentFailureDecision} from '../lib/membership-dunning-policy.ts';

test('membership payment failures keep a grace period and cancel on the configured final failure',()=>{
 const policy={...defaultQuotePolicy.membership.dunning,gracePeriodDays:7,maxFailedPayments:3};
 const now=new Date('2026-10-08T12:00:00Z');
 const first=paymentFailureDecision(policy,0,null,now);
 assert.equal(first.status,'grace_period');
 assert.equal(first.failedPaymentCount,1);
 assert.equal(first.graceEndsAt.toISOString(),'2026-10-15T12:00:00.000Z');
 assert.equal(paymentFailureDecision(policy,1,first.failedAt,new Date('2026-10-10T12:00:00Z')).status,'grace_period');
 const final=paymentFailureDecision(policy,2,first.failedAt,new Date('2026-10-12T12:00:00Z'));
 assert.equal(final.status,'cancelled');
 assert.equal(final.cancel,true);
});

test('zero-day grace cancels immediately and templates replace safe placeholders',()=>{
 const policy={...defaultQuotePolicy.membership.dunning,gracePeriodDays:0,maxFailedPayments:3};
 assert.equal(paymentFailureDecision(policy,0,null,new Date('2026-10-08T12:00:00Z')).status,'cancelled');
 assert.match(membershipMessage('{tier} ends {graceEnd}',{tier:'Gold',graceEnd:new Date('2026-10-15T12:00:00Z')}),/^Gold ends 15 Oct 2026$/);
});
