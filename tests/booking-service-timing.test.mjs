import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {bookingServiceTimingSql,timingPolicy} from '../lib/booking-service-timing.mjs';
const base={id:'booking',b:{typeOfBooking:'ASAP',status:'COMPLETED',estimatedTime:'00:20:00'},t:{bookedAt:'2026-10-22T04:50:00Z',arrivedAt:'2026-10-22T05:00:00Z',estimatedPickupAt:'2026-10-22T05:00:00Z'},raw:{}};
const fixture=(id,changes)=>({...base,...changes,id,b:{...base.b,...changes.b},t:{...base.t,...changes.t}});
test('hand-computed boundaries, pre-book DAP rule, unknowns, phase delays, drop-off estimates and BST are evaluated in SQL',async()=>{
 const db=new PGlite();try{
 const inputs=[base,
 fixture('late',{t:{arrivedAt:'2026-10-22T05:00:01Z'}}),fixture('fifteen',{t:{arrivedAt:'2026-10-22T05:05:00Z'}}),fixture('severe',{t:{arrivedAt:'2026-10-22T05:05:01Z'}}),
 fixture('prebook',{b:{typeOfBooking:'Advanced'},t:{scheduledAt:'2026-10-22T05:00:00Z',arrivedAt:'2026-10-22T04:59:00Z'}}),
 fixture('prelate',{b:{typeOfBooking:'Advanced'},t:{scheduledAt:'2026-10-22T05:00:00Z',arrivedAt:'2026-10-22T04:59:01Z'}}),
 fixture('early',{b:{typeOfBooking:'Advanced'},t:{scheduledAt:'2026-10-22T05:00:00Z',arrivedAt:'2026-10-22T04:54:00Z'}}),
 fixture('missing',{t:{arrivedAt:null}}),fixture('pending',{b:{status:'BOOKED'},t:{arrivedAt:null}}),fixture('cancelled',{b:{status:'CANCELLED'}}),
 fixture('phases',{t:{dispatchedAt:'2026-10-22T04:57:00Z',acceptedAt:'2026-10-22T04:58:00Z',onBoardAt:'2026-10-22T05:02:00Z'}}),
 fixture('supplied',{t:{dropOffDueAt:'2026-10-22T05:30:00Z'}}),fixture('noestimate',{b:{estimatedTime:null},t:{estimatedPickupAt:null}}),
 fixture('unknown',{b:{typeOfBooking:null},raw:{bookingType:'Archived'}}),
 fixture('dst',{t:{bookedAt:'2026-10-25T01:55:00+01:00',arrivedAt:'2026-10-25T01:05:00Z'}}),
 fixture('invalid',{t:{arrivedAt:'2026-10-22T04:49:00Z'}}),fixture('13215177',{t:{bookedAt:'2026-10-22T03:54:41.470Z',arrivedAt:'2026-10-22T04:04:51.844Z'}})
 ];
 const {rows}=await db.query(bookingServiceTimingSql,[JSON.stringify(inputs),'2026-10-22T06:00:00Z',10,15]);const result=Object.fromEntries(rows.map(x=>[x.id,x.service_timing]));
 for(const [id,expected] of Object.entries({booking:'ON_TIME',late:'LATE',fifteen:'LATE',severe:'SEVERELY_LATE',prebook:'ON_TIME',prelate:'LATE',early:'EARLY',missing:'UNKNOWN',pending:'OVERDUE_UNCONFIRMED',cancelled:'NOT_ASSESSED',unknown:'UNKNOWN',dst:'ON_TIME',invalid:'INVALID_TIMELINE','13215177':'LATE'}))assert.equal(result[id].assessment,expected,id);
 assert.equal(Date.parse(result.booking.estimatedDropoffAt),Date.parse('2026-10-22T05:20:00Z'));
 assert.equal(Date.parse(result.supplied.estimatedDropoffAt),Date.parse('2026-10-22T05:30:00Z'));
 assert.equal(result.noestimate.estimatedDropoffAt,null);
 assert.equal(Date.parse(result.phases.estimatedDropoffAt),Date.parse('2026-10-22T05:22:00Z'));
 assert.equal(result['13215177'].bookingToDapMinutes,10.2);
 assert.equal(result.phases.dispatchDelayMinutes,7);assert.equal(result.phases.dispatchToDapMinutes,3);assert.equal(result.phases.acceptanceToDapMinutes,2);assert.equal(result.phases.dapToOnboardMinutes,2);
 assert.equal(result.dst.bookingToDapMinutes,10);
 const custom=(await db.query(bookingServiceTimingSql,[JSON.stringify([base]),null,8,12])).rows[0].service_timing;assert.equal(custom.assessment,'LATE');
 }finally{await db.close()}
});
test('invalid threshold configurations fail clearly',()=>{assert.deepEqual(timingPolicy({}),{asap:10,severe:15});assert.throws(()=>timingPolicy({BOOKING_ASAP_ON_TIME_MINUTES:'20',BOOKING_ASAP_SEVERE_MINUTES:'15'}));});
