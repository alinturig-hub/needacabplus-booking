import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchObservation} from '../lib/dispatch-observation.ts';
test('receipt extracts explicit IDs and does not confuse vehicle id with booking id',()=>{
 assert.deepEqual(dispatchObservation('booking_accepted',{booking:{bookingId:31,vehicle:{id:88},driverId:12}}),{eventType:'booking_accepted',bookingId:'31',vehicleId:'88',driverId:'12'});
 assert.equal(dispatchObservation('booking_rejected',{vehicle:{id:88}}).bookingId,null);
 assert.equal(dispatchObservation('booking_rejected',{metadata:{id:88}}).bookingId,null);
});
test('receipts tolerate missing payload and supported data wrapper',()=>{
 assert.equal(dispatchObservation('booking_dispatch',null).vehicleId,null);
 assert.equal(dispatchObservation('booking_dispatch',{data:{booking:{bookingID:'31',vehicleId:'88'}}}).bookingId,'31');
});
