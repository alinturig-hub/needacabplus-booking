import {test} from 'node:test';
import assert from 'node:assert/strict';
import {membershipEntitlement,type MembershipRecord} from '../lib/membership-entitlement';
import {defaultQuotePolicy} from '../lib/quote-policy';
const now=Date.parse('2026-10-17T14:00:00Z');
const row:MembershipRecord={tier_id:'silver',status:'active',starts_at:'2026-10-17T13:00:00Z',ends_at:null,grace_ends_at:null};
test('operator test access unlocks one membership without enabling paid subscriptions',()=>{
 const until='2026-11-16T14:00:00.000Z';
 assert.equal(membershipEntitlement(row,defaultQuotePolicy,now),null);
 assert.deepEqual(membershipEntitlement({...row,operator_access_until:until},defaultQuotePolicy,now),{tierId:'silver',tierName:'Silver',testAccessUntil:until});
 assert.equal(membershipEntitlement(undefined,defaultQuotePolicy,now),null);
});
test('expired, cancelled, future and disabled test memberships have no access',()=>{
 const grant={...row,operator_access_until:'2026-11-16T14:00:00Z'};
 for(const patch of [{status:'cancelled'},{ends_at:'2026-10-16T14:00:00Z'},{operator_access_until:'2026-10-16T14:00:00Z'},{starts_at:'2026-10-18T14:00:00Z'}])assert.equal(membershipEntitlement({...grant,...patch},defaultQuotePolicy,now),null);
 const policy=structuredClone(defaultQuotePolicy);policy.membership.tiers.silver.enabled=false;
 assert.equal(membershipEntitlement(grant,policy,now),null);
});
test('normal paid membership and grace rules still apply',()=>{
 const policy=structuredClone(defaultQuotePolicy);policy.membership.enabled=true;policy.membership.tiers.silver.monthlyPrice=10;
 assert.equal(membershipEntitlement(row,policy,now)?.tierName,'Silver');
 assert.equal(membershipEntitlement({...row,status:'grace_period',grace_ends_at:'2026-10-18T14:00:00Z'},policy,now)?.tierName,'Silver');
 assert.equal(membershipEntitlement({...row,status:'past_due'},policy,now),null);
 assert.equal(membershipEntitlement({...row,status:'grace_period',grace_ends_at:'2026-10-16T14:00:00Z'},policy,now),null);
});
