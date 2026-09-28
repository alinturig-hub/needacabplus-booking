import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archivedBookingStatus,isUpcomingPickup} from '../lib/dispatch-queue.ts';
test('Autocab archive confirms completion; old pickup alone does not',()=>{
 assert.equal(archivedBookingStatus({archivedBooking:{reason:'Completed',completedAtTime:'2026-09-27T23:55:06+01:00'}}),'Completed');
 assert.equal(archivedBookingStatus({pickupDueTime:'2026-09-27T23:45:00+01:00'}),null);
 assert.equal(archivedBookingStatus({archivedBooking:{reason:'Unknown'}}),null);
 assert.equal(archivedBookingStatus(null),null);
 assert.equal(archivedBookingStatus({archivedBooking:{reason:'Cancelled'}}),'Cancelled');
});
test('past and malformed pickup times cannot occupy next upcoming slot',()=>{
 const now=Date.parse('2026-09-28T05:00:00+01:00');
 assert.equal(isUpcomingPickup('2026-09-27T23:45:00+01:00',now),false);
 assert.equal(isUpcomingPickup('2026-09-28T05:30:00+01:00',now),true);
 assert.equal(isUpcomingPickup(null,now),false);
 assert.equal(isUpcomingPickup('invalid',now),false);
});
