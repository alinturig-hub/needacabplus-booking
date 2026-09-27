import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bookingRequirements} from '../lib/booking-requirements.ts';
import {capabilityIds,matchDispatchRequirements} from '../lib/dispatch-capabilities.ts';

test('reads root requirements even when unrelated metadata exists',()=>{
 assert.deepEqual(bookingRequirements({metadata:{event:'created'},capabilities:[46,8]}),{capabilities:[46,8]});
});
test('reads booking envelope and capability IDs case insensitively',()=>{
 const detail=bookingRequirements({Data:{Booking:{Capabilities:[{ID:46},{CapabilityId:8}],Passengers:'4'}}});
 assert.deepEqual(capabilityIds(detail.capabilities),['46','8']);
 assert.equal(matchDispatchRequirements(detail.capabilities,{driver_id:'62',vehicle_id:'88',driver_capabilities:[46],vehicle_capabilities:[8],passenger_capacity:4},detail).ok,true);
});
test('partial events preserve saved requirements while an explicit empty list clears them',()=>{
 const saved=bookingRequirements({metadata:{capabilities:[8],passengers:4}});
 assert.deepEqual({...saved,...bookingRequirements({booking:{id:1}})},saved);
 assert.deepEqual({...saved,...bookingRequirements({booking:{capabilities:[]}})},{capabilities:[],passengers:4});
});
test('never borrows fleet capabilities or treats missing requirements as no requirements',()=>{
 assert.deepEqual(bookingRequirements({booking:{vehicle:{capabilities:[8]},driver:{capabilities:[46]}}}),{});
 assert.equal(capabilityIds(bookingRequirements({metadata:{capabilities:null}}).capabilities),null);
});
