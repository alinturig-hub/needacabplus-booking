import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bookingPolicySchema,bookingServiceAccess} from '../lib/booking-policy';

test('standard journeys remain available while member services require a paid subscription',()=>{
 const policy=bookingPolicySchema.parse({});
 assert.deepEqual(bookingServiceAccess(policy,false),{asap:true,prebook:true,priority:false,guarantee:false,quietAsap:false,loyalty:false});
 assert.deepEqual(bookingServiceAccess(policy,true),{asap:true,prebook:true,priority:true,guarantee:true,quietAsap:true,loyalty:true});
});

test('each booking rule can allow its benefit without a membership',()=>{
 const policy=bookingPolicySchema.parse({priorityRequiresPaidMembership:false,guaranteeRequiresPaidMembership:false,quietAsapRequiresPaidMembership:false,loyaltyRequiresPaidMembership:false});
 assert.deepEqual(bookingServiceAccess(policy,false),{asap:true,prebook:true,priority:true,guarantee:true,quietAsap:true,loyalty:true});
});
