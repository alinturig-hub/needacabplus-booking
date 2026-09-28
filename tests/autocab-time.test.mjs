import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autocabIso,autocabTime} from '../lib/autocab-time.mjs';
import {compareBooking} from '../scripts/compare-booking.mjs';
import {sourceTimestamp} from '../lib/dispatch-history.ts';
test('operator summer and winter times use London, independent of server timezone',()=>{
 for(const tz of ['UTC','America/New_York']){
  const prior=process.env.TZ;process.env.TZ=tz;
  try{assert.equal(autocabIso('2026-09-28T05:20:00'),'2026-09-28T04:20:00.000Z');assert.equal(autocabIso('2026-12-28T05:20:00'),'2026-12-28T05:20:00.000Z');assert.equal(autocabIso('2026-09-26T00:00:00'),'2026-09-25T23:00:00.000Z')}finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior}
 }
});
test('DST ambiguity, nonexistent local time and invalid dates are not guessed',()=>{
 for(const time of ['2026-10-25T01:30:00','2026-03-29T01:30:00','2026-02-30T12:00:00','nonsense'])assert.equal(autocabIso(time),null);
 assert.equal(autocabIso('2026-10-25T01:30:00+01:00'),'2026-10-25T00:30:00.000Z');
 assert.equal(autocabIso('2026-10-25T01:30:00+00:00'),'2026-10-25T01:30:00.000Z');
});
test('reported webhook/API samples match while real changes remain differences',()=>{
 const result=compareBooking({timeline_data:{scheduledAt:'2026-09-25T14:15:55.085'}},{pickupDueTime:'2026-09-25T13:15:55+00:00',pickupDueTimeUtc:'2026-09-25T13:15:55.085Z'});
 assert.ok(!result.differences.includes('pickupTime'));
 assert.ok(compareBooking({timeline_data:{scheduledAt:'2026-09-28T05:20:00'}},{pickupDueTimeUtc:'2026-09-28T04:25:00Z'}).differences.includes('pickupTime'));
 assert.ok(compareBooking({timeline_data:{scheduledAt:'2026-10-25T01:30:00'}},{pickupDueTimeUtc:'2026-10-25T01:30:00Z'}).unverified.includes('pickupTime'));
 assert.ok(Number.isNaN(autocabTime(null)));
});
test('future webhook event timestamps normalize UK local values',()=>{
 assert.equal(sourceTimestamp({DispatchedAtTime:'2026-09-28T05:20:00'},'Booking Dispatch Offered'),'2026-09-28T04:20:00.000Z');
 assert.equal(sourceTimestamp({PickupDueTime:'2026-09-28T05:20:00'},'Booking Accepted'),null);
});
