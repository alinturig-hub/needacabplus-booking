import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timeEvidence} from '../scripts/audit-time-evidence.mjs';
test('equivalent offsets and UTC compare as the same instant',()=>{
 const result=timeEvidence({timeline_data:{scheduledAt:'2026-09-28T09:00:00+01:00'}},{pickupDueTime:'2026-09-28T08:00:00Z',pickupDueTimeUtc:'2026-09-28T08:00:00Z'});
 assert.equal(result.deltaSeconds,0);assert.equal(result.utcDeltaSeconds,0);
});
test('ambiguous UK local and invalid dates remain unverified',()=>{
 for(const time of ['2026-10-25T01:30:00','badZ'])assert.equal(timeEvidence({timeline_data:{scheduledAt:time}},{pickupDueTime:'2026-09-28T08:00:00Z'}).deltaSeconds,null);
});
test('one-hour mismatch is evidence, never silently repaired',()=>{
 assert.equal(timeEvidence({timeline_data:{scheduledAt:'2026-09-28T09:00:00Z'}},{pickupDueTime:'2026-09-28T08:00:00Z'}).deltaSeconds,-3600);
});
