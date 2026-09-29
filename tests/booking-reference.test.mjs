import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isNeedACabPlusReference,needACabPlusQuoteId,needACabPlusReference,summarizeBookingReferences} from '../lib/booking-reference.ts';

test('Need A Cab Plus reference marks the source and keeps a unique booking link',()=>{
 const id='550e8400-e29b-41d4-a716-446655440000',reference=needACabPlusReference(id);
 assert.equal(reference,`NAC-${id}`);
 assert.equal(isNeedACabPlusReference(reference),true);
 assert.equal(needACabPlusQuoteId(reference),id);
 assert.equal(isNeedACabPlusReference('Other operator'),false);
 assert.equal(needACabPlusQuoteId('NAC-not-a-uuid'),null);
});

test('reference audit counts empty, Need A Cab Plus and other fields independently',()=>{
 const report=summarizeBookingReferences([
  {external_booking_id:'1',our_reference:'NAC-550e8400-e29b-41d4-a716-446655440000',your_references:{yourReference1:'NAC-1'}},
  {external_booking_id:'2',our_reference:'Other system',your_references:{YourReference2:'Account ref'}},
  {external_booking_id:'3',our_reference:'',your_references:{}},
 ]);
 assert.deepEqual({...report.ourReference,otherExamples:undefined},{filled:2,empty:1,needACabPlus:1,other:1,otherExamples:undefined});
 assert.deepEqual(report.ourReference.otherExamples,[{bookingId:'2',value:'Other system'}]);
 assert.equal(report.yourReferences[0].filled,1);
 assert.equal(report.yourReferences[1].filled,1);
 assert.equal(report.yourReferences[7].filled,0);
});
