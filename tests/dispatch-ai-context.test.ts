import assert from 'node:assert/strict';
import {dispatchAiSummary,type DispatchAiJob} from '../lib/dispatch-ai-context';
import type {FleetMapVehicle} from '../lib/taxicrm-fleet-map';

const now=Date.parse('2026-10-16T12:00:00Z');
const jobs:DispatchAiJob[]=[
 {id:'urgent',reference:'BKG-URGENT',pickup:'Plymouth Station',destination:'City Centre',pickup_zone:'Central',status:'Booked',due_at:'2026-10-16T11:55:00Z',vehicle:null,assigned:false},
 {id:'later',reference:'BKG-LATER',pickup:'Airport',destination:'Plymouth',pickup_zone:null,status:'Booked',due_at:'2026-10-16T17:00:00Z',vehicle:null,assigned:false},
];
const vehicle=(id:string,recordedAt:string):FleetMapVehicle=>({id,driverId:id,callsign:id,name:null,latitude:50,longitude:-4,vehicleStatus:'Clear',operationalStatus:'CLEAR',recordedAt,isLive:true,registration:id,bookingId:null,pickupAddress:null,destinationAddress:null,todayRevenue:null});

const summary=dispatchAiSummary({jobs,activeTotal:2,serverTime:new Date(now).toISOString(),source:'taxicrm'},[
 vehicle('FRESH','2026-10-16T11:59:30Z'),vehicle('STALE','2026-10-16T11:54:00Z'),
],'What needs attention?',{},now);
assert.equal(summary.bookings.overdue,1);
assert.equal(summary.bookings.records[0].reference,'BKG-URGENT');
assert.equal(summary.drivers.clear,1,'a stale Clear status must not count as available');
assert.match(summary.recommendations.join(' '),/past pickup time/);
assert.match(summary.recommendations.join(' '),/Review proximity and capability/);

const partial=dispatchAiSummary(undefined,[], 'What needs attention?',{},now);
assert.equal(partial.bookingSource,'unavailable');
assert.match(partial.recommendations.join(' '),/booking feed is unavailable/i);
