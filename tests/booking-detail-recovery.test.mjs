import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverAssignmentDetails} from '../lib/autocab/assignment-details.mjs';
import {recoverBookingDetails,sourceTimestamp} from '../lib/autocab/booking-detail-recovery.mjs';
const row={id:'b',provider:'AUTOCAB',externalId:'123',status:'COMPLETED',driverId:'5',vehicleId:'8'};
const doc=(payload,kind='canonical_raw')=>({kind,id:'source',payload});
test('recovers archived full name and real registration without splitting names or using call signs as identifiers',()=>{
 const r=recoverAssignmentDetails({...row,vehicleCallSign:'11',vehicleRegistration:'11'},[doc({archivedBooking:{originalAutoID:123,reason:'Completed',driver:{id:5,fullName:'Original Full Name'},vehicle:{id:8,callsign:'11'},regNumber:'AB12 CDE'}},'archive')]);
 assert.equal(r.details.driver.name,'Original Full Name');assert.equal(r.patch.driverForename,undefined);assert.equal(r.patch.vehicleRegistration,'AB12 CDE');
 assert.equal(r.details.vehicle.registration,'AB12 CDE');
});
test('recovers missing assignment IDs only from an archive with matching original reference and final outcome',()=>{
 const r=recoverAssignmentDetails({...row,driverId:null,vehicleId:null},[doc({archivedBooking:{originalAutoID:123,reason:'Cancelled',driver:{id:6}}},'archive'),doc({archivedBooking:{originalAutoID:123,reason:'Completed',driver:{id:5,fullName:'Saved'}}},'archive')]);
 assert.equal(r.patch.driverId,'5');
 assert.equal(recoverAssignmentDetails({...row,driverId:null},[doc({archivedBooking:{originalAutoID:999,reason:'Completed',driver:{id:5}}},'archive')]).patch.driverId,undefined);
});
test('explicit unassignment and rejected offers cannot resurrect a previous driver',()=>{
 const r=recoverAssignmentDetails({...row,driverId:null},[doc({BookingId:123,Driver:null}),doc({archivedBooking:{originalAutoID:123,reason:'Completed',driver:{id:5}}},'archive')]);assert.equal(r.details.driver,null);assert.equal(r.patch.driverId,undefined);
 const rejected=recoverAssignmentDetails({...row,status:'REJECTED',driverId:null},[doc({BookingId:123,Driver:{Id:5}})]);assert.equal(rejected.patch.driverId,undefined);
});
test('legacy raw fields remain usable without joining a current register by reused call sign',()=>{
 const r=recoverAssignmentDetails({...row,driverId:null,vehicleId:null},[doc({autocab_booking_id:123,driver_name:'Saved Driver',driver_phone:'test-phone',vehicle_registration:'AB12 CDE',vehicle_make:'Saved make'})]);
 assert.equal(r.details.driver.name,'Saved Driver');assert.equal(r.details.driver.legacy,true);assert.equal(r.patch.driverId,undefined);assert.equal(r.details.vehicle.make,'Saved make');
 const repeated=recoverAssignmentDetails({...row,...r.patch,driverId:null,vehicleId:null,assignmentDetails:r.details},[doc({autocab_booking_id:123,driver_name:'Saved Driver',driver_phone:'test-phone',vehicle_registration:'AB12 CDE',vehicle_make:'Saved make'})],{onlyWhenAddsInformation:true});assert.equal(repeated.changed,false);
});
test('mismatched assignment IDs and provider snapshots are ignored',()=>{
 const r=recoverAssignmentDetails({...row,assignmentDetails:{provider:'OTHER',bookingRef:'123',driver:{id:'5',name:'Wrong'}}},[doc({BookingId:123,Driver:{Id:6,Forename:'Wrong'}})]);assert.equal(r.details.driver.name,undefined);assert.equal(r.patch.driverForename,undefined);
});
test('fills saved locations and timeline, retains financial zero, and never substitutes an older route',()=>{
 const raw={autocab_booking_id:123,pickup_address:'Station',pickup_zone_id:12,pickup_lat:0,pickup_lng:0,pickup_due_time:'2026-10-22T06:30:00+01:00',completed_at:'2026-10-22T06:45:00+01:00',price:99,distance:0,vias:[]};
 const r=recoverBookingDetails({...row,price:0},[doc(raw),doc({archivedBooking:{originalAutoID:123,reason:'Completed'},pickup:{address:{text:'Different old route',zone:{id:99},coordinate:{latitude:51,longitude:-4}}}},'archive')],[{type:'PICKUP',address:'Station',latitude:null,longitude:null}]);
 assert.equal(r.patch.price,undefined);assert.equal(r.patch.distance,'0');assert.equal(r.patch.pickupDueTime,'2026-10-22T05:30:00.000Z');assert.equal(r.locations[0].zoneId,'12');assert.equal(r.locations[0].latitude,'0');assert.equal(r.locations[0].longitude,'0');assert.equal(r.vias.length,0);
 const repeated=recoverBookingDetails({...row,...r.patch,price:0},[doc(raw)],[{...r.locations[0]}]);assert.deepEqual(repeated.locations,[]);assert.deepEqual(repeated.patch,{});
});
test('does not fabricate completion for an arrived booking or reinterpret archive NoJob as NoFare',()=>{
 const raw={BookingId:123,CompletedAtTime:'2026-10-22T06:45:00+01:00',CancelledAtTime:'2026-10-22T06:45:00+01:00'};
 const r=recoverBookingDetails({...row,status:'ARRIVED'},[doc(raw)]);assert.deepEqual(r.patch,{});
 const noFare=recoverBookingDetails({...row,status:'NO_FARE'},[doc({archivedBooking:{originalAutoID:123,reason:'NoJob',completedAtTime:'2026-10-22T06:45:00+01:00'}},'archive')]);assert.deepEqual(noFare.patch,{});
});

test('unoffset feed UTC values and explicit BST offsets resolve to the same instant',()=>{
 assert.equal(sourceTimestamp('2026-10-22T05:30:00'),'2026-10-22T05:30:00.000Z');
 assert.equal(sourceTimestamp('2026-10-22T06:30:00+01:00'),'2026-10-22T05:30:00.000Z');
 assert.equal(sourceTimestamp('0001-01-01T00:00:00Z'),null);
});
test('repairs a proven old UTC interpretation of raw London wall time but preserves newer and normalized legacy facts',()=>{
 const raw={BookingId:123,BookedAtTime:'2026-10-22T04:54:41.4703388'};
 const r=recoverBookingDetails({...row,bookedAtTime:new Date('2026-10-22T04:54:41.470Z')},[doc(raw)]);
 assert.equal(r.patch.bookedAtTime,'2026-10-22T03:54:41.470Z');
 assert.equal(recoverBookingDetails({...row,bookedAtTime:new Date('2026-10-22T03:54:41.470Z')},[doc(raw)]).patch.bookedAtTime,undefined);
 assert.equal(recoverBookingDetails({...row,bookedAtTime:new Date('2026-10-22T02:54:41.470Z')},[doc(raw)]).patch.bookedAtTime,undefined);
 assert.equal(recoverBookingDetails({...row,bookedAtTime:new Date('2026-10-22T04:54:41.470Z')},[doc({autocab_booking_id:123,booked_at:'2026-10-22T04:54:41.470Z'})]).patch.bookedAtTime,undefined);
});
