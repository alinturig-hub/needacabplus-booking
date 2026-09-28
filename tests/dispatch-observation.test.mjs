import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchObservation} from '../lib/dispatch-observation.ts';
import {sourceTimestamp,receiptCallsigns,operationKind} from '../lib/dispatch-history.ts';
import {receiptText} from '../lib/dispatch-analytics.ts';

test('TaxiCRM webhook DriverDetails and VehicleDetails produce callsign event titles',()=>{
 const payload={Metadata:{BookingId:13177357,DriverDetails:{Driver:{Id:1211,Callsign:'906'}},VehicleDetails:{Vehicle:{Id:1495,Callsign:'906'}}}};
 const ids=dispatchObservation('Booking Dispatch Offered',payload),labels=receiptCallsigns(payload);
 assert.equal(ids.driverId,'1211');assert.equal(ids.vehicleId,'1495');
 assert.deepEqual(labels,{driver:'906',vehicle:'906'});
 const row={kind:operationKind(ids.eventType),event_type:ids.eventType,driver_id:ids.driverId,vehicle_id:ids.vehicleId,driver_callsign:labels.driver,vehicle_callsign:labels.vehicle};
 assert.equal(receiptText(row),'Job offered to Driver 906');
 assert.equal(receiptText({...row,kind:'accepted'}),'Driver 906 accepted — awaiting arrival');
 assert.equal(receiptText({...row,kind:'rejected'}),'Driver 906 rejected the job');
});
test('callsigns can be supplied separately from metadata and without fleet IDs',()=>{
 assert.deepEqual(receiptCallsigns({metadata:{bookingId:1},DriverDetails:{Driver:{Callsign:'062'}},VehicleDetails:{Vehicle:{Callsign:45}}}),{driver:'062',vehicle:'45'});
 assert.deepEqual(receiptCallsigns({data:{booking:{driverDetails:{driver:{id:62,callSign:'062'}}}}}),{driver:'062',vehicle:null});
});

test('Autocab dispatchedBooking IDs survive metadata envelopes without borrowing them for a refusal',()=>{
 const payload={metadata:{bookingId:13177357},dispatchedBooking:{driverId:1211,vehicleId:1495,dispatchedAtTime:'2026-09-28T05:21:09.9065496+01:00'}};
 assert.equal(dispatchObservation('Booking Dispatch Offered',payload).driverId,'1211');
 assert.equal(dispatchObservation('Booking Arrived',payload).vehicleId,'1495');
 assert.equal(dispatchObservation('Booking Rejected',payload).driverId,null);
 assert.equal(sourceTimestamp(payload,'Booking Dispatch Offered'),'2026-09-28T04:21:09.906Z');
 assert.equal(sourceTimestamp(payload,'Booking Dispatch Accepted'),null);
});
test('explicit event actors take precedence over current dispatchedBooking assignment',()=>{
 assert.equal(dispatchObservation('Booking Rejected',{metadata:{driverId:62},dispatchedBooking:{driverId:45}}).driverId,'62');
 assert.equal(dispatchObservation('Booking Arrived',{Metadata:{bookingId:31},Driver:{Id:1211},Vehicle:{Id:1495}}).driverId,'1211');
 assert.equal(sourceTimestamp({Metadata:{EventTimestamp:'2026-09-28T04:24:42Z'}},'Booking Arrived'),'2026-09-28T04:24:42.000Z');
});
test('receipt extracts explicit IDs and does not confuse vehicle id with booking id',()=>{
 assert.deepEqual(dispatchObservation('booking_accepted',{booking:{bookingId:31,vehicle:{id:88},driverId:12}}),{eventType:'booking_accepted',bookingId:'31',vehicleId:'88',driverId:'12'});
 assert.equal(dispatchObservation('booking_rejected',{vehicle:{id:88}}).bookingId,null);
 assert.equal(dispatchObservation('booking_rejected',{metadata:{id:88}}).bookingId,null);
});
test('receipts tolerate missing payload and supported data wrapper',()=>{
 assert.equal(dispatchObservation('booking_dispatch',null).vehicleId,null);
 assert.equal(dispatchObservation('booking_dispatch',{data:{booking:{bookingID:'31',vehicleId:'88'}}}).bookingId,'31');
});
