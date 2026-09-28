import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareBooking} from '../scripts/compare-booking.mjs';
test('audit detects stale modified status and compares capability sets without order noise',()=>{
 const result=compareBooking({status:'Modified',dispatch_requirements:{capabilities:[8,46]}},{archivedBooking:{reason:'Completed'},capabilities:[46,8]});
 assert.ok(result.differences.includes('terminalStatus'));
 assert.ok(!result.differences.includes('capabilities'));
 assert.ok(result.unverified.includes('driver'));
});
test('audit distinguishes unverified active status from a confirmed mismatch',()=>{
 const result=compareBooking({status:'Driver Accepted',fare_pence:1200},{pricing:{price:12}});
 assert.deepEqual(result.differences,[]);
 assert.ok(result.unverified.includes('terminalStatus'));
});
