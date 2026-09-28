import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bookingMetrics,aggregateDispatch,receiptText} from '../lib/dispatch-analytics.ts';
import {receiptFingerprint,customerProfileKey,sourceTimestamp} from '../lib/dispatch-history.ts';
const base=Date.UTC(2030,0,1,14);
const event=(id,kind,driver,seconds)=>({id:String(id),kind,event_type:kind,booking_id:'100',driver_id:driver,driver_callsign:driver,vehicle_id:driver,customer_key:'customer-one',received_at:new Date(base+seconds*1000).toISOString(),dedup_key:String(id)});
const journey=[event(1,'offered','62',0),event(2,'rejected','62',120),event(3,'offered','45',180),event(4,'accepted','45',600),event(5,'arrived','45',900)];
test('driver 62 rejects, driver 45 accepts after ten minutes, then arrives',()=>{
 const result=bookingMetrics(journey);
 assert.equal(result.offerToAcceptSeconds,600);
 assert.equal(result.acceptToArrivalSeconds,300);
 assert.deepEqual(result.attempts.map(row=>row.responseSeconds),[120,420]);
 assert.equal(receiptText(journey[3]),'Driver 45 accepted — awaiting arrival');
 const stats=aggregateDispatch(journey);
 assert.equal(stats.meanDispatchSeconds,600);assert.equal(stats.measuredBookings,1);
 assert.equal(stats.drivers.find(row=>row.id==='62').rejected,1);
 assert.equal(stats.drivers.find(row=>row.id==='45').accepted,1);
 assert.equal(stats.customers[0].bookings,1);
});
test('duplicates and late rejection from a different driver do not overwrite the accepted attempt',()=>{
 const late=event(6,'rejected','62',750);
 const result=bookingMetrics([...journey,journey[3],late]);
 assert.equal(result.offerToAcceptSeconds,600);
 assert.equal(result.attempts.filter(row=>row.response?.kind==='accepted').length,1);
});
test('missing offers and unidentifiable drivers never invent durations',()=>{
 assert.equal(bookingMetrics([journey[3]]).offerToAcceptSeconds,null);
 const unlinked=[event(1,'offered',null,0),event(2,'accepted',null,600)];
 assert.equal(bookingMetrics(unlinked).offerToAcceptSeconds,null);
 assert.equal(aggregateDispatch(unlinked).drivers.length,0);
});
test('source timestamps order delayed deliveries; empty history stays empty',()=>{
 const delayed={...journey[1],received_at:new Date(base+1200*1000).toISOString(),source_at:journey[1].received_at};
 assert.equal(bookingMetrics([{...journey[0],source_at:journey[0].received_at},delayed,...journey.slice(2).map(row=>({...row,source_at:row.received_at}))]).attempts[0].responseSeconds,120);
 assert.equal(aggregateDispatch([]).meanDispatchSeconds,null);
});
test('receipt deduplication is stable across property order and contact keys are private',()=>{
 assert.equal(receiptFingerprint('BookingAccepted',{bookingId:1,driverId:2}),receiptFingerprint('booking_accepted',{driverId:2,bookingId:1}));
 const secret='test-only-key';
 assert.equal(customerProfileKey('07700 900123',secret),customerProfileKey('+447700900123',secret));
 assert.equal(customerProfileKey('Not supplied',secret),null);
 assert.equal(customerProfileKey('07700900123',undefined),null);
 assert.equal(sourceTimestamp({pickupDueTime:'2030-01-01T14:00:00Z'}),null);
 assert.equal(sourceTimestamp({timestamp:'2030-01-01T14:00:00Z'}),'2030-01-01T14:00:00.000Z');
});

test('equal timestamps retain acceptance but do not claim an instant dispatch',()=>{
 const rows=[event(1,'offered','62',0),event(2,'accepted','62',0)];
 const metrics=bookingMetrics(rows);assert.equal(metrics.attempts[0].response.kind,'accepted');
 assert.equal(metrics.offerToAcceptSeconds,null);assert.equal(metrics.attempts[0].responseSeconds,null);
 const stats=aggregateDispatch(rows);assert.equal(stats.measuredBookings,0);assert.equal(stats.meanDispatchSeconds,null);assert.equal(stats.timingQuality.unusableResponseTimes,1);assert.equal(stats.drivers[0].accepted,1);
});
test('delivery and event clocks are not subtracted, positive subsecond times remain valid',()=>{
 const offer=event(1,'offered','62',0),accepted=event(2,'accepted','62',10);
 assert.equal(bookingMetrics([{...offer,source_at:offer.received_at},accepted]).offerToAcceptSeconds,10);
 assert.equal(bookingMetrics([offer,event(2,'accepted','62',0.125)]).offerToAcceptSeconds,0.125);
});

test('missing source time uses two delivery times, never a hybrid duration',()=>{
 const offered={...event(1,'offered','62',60),source_at:new Date(base).toISOString()};
 const accepted=event(2,'accepted','62',90);
 const result=bookingMetrics([offered,accepted]);assert.equal(result.offerToAcceptSeconds,30);
 const stats=aggregateDispatch([offered,accepted]);assert.equal(stats.timingQuality.receiptTimedResponses,1);assert.equal(stats.timingQuality.sourceTimedResponses,0);
});
test('reversed delivery order without comparable source timestamps stays unmeasured',()=>{
 const offered={...event(1,'offered','62',60),source_at:new Date(base).toISOString()};
 assert.equal(bookingMetrics([offered,event(2,'accepted','62',30)]).offerToAcceptSeconds,null);
});
