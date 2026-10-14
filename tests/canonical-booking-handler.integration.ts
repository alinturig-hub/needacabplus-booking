import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

const url=process.env.CANONICAL_WRITER_TEST_URL;
if(!url || !/^postgresql?:\/\/[^@]+@127\.0\.0\.1:\d+\//.test(url)){
 throw new Error('Set CANONICAL_WRITER_TEST_URL to a disposable localhost PostgreSQL database.');
}
process.env.DATABASE_URL=url;

const {prisma}=await import('@/lib/prisma');
const {applyCanonicalBookingEvent}=await import('@/lib/autocab/canonical-booking-handler');

async function apply(eventType:string,payload:Prisma.InputJsonObject){
 const event=await prisma.webhookEvent.create({data:{eventType,payload,idempotencyKey:`test:${randomUUID()}`}});
 return prisma.$transaction(tx=>applyCanonicalBookingEvent(tx,event.id,eventType));
}

try{
 const externalId=`writer-test-${randomUUID()}`;
 await assert.rejects(
  apply('BookingModified',{BookingId:externalId,Name:'Before parent'}),
  /waiting for its booking/,
 );
 const created=await apply('BookingCreated',{
  BookingId:externalId,Name:'Test Passenger',TelephoneNumber:'07123456789',
  Pickup:{Address:'1 Test Street'},Destination:{Address:'2 Test Street'},
 });
 await apply('BookingComplete',{BookingId:externalId,Name:'Test Passenger'});
 await apply('BookingModified',{BookingId:externalId,Name:'Updated Passenger'});
 // A delayed active event must not regress a completed booking.
 await apply('BookingDispatched',{BookingId:externalId,Name:'Stale Passenger'});
 const booking=await prisma.booking.findUniqueOrThrow({
  where:{provider_externalId:{provider:'AUTOCAB',externalId}},
  include:{locations:true,timelineEvents:true,snapshots:true},
 });
 assert.equal(booking.id,created.bookingId);
 assert.equal(booking.status,'COMPLETED');
 assert.equal(booking.customerName,'Updated Passenger');
 assert.equal(booking.locations.length,2);
 assert.equal(booking.timelineEvents.length,4);
 assert.equal(booking.snapshots.length,4);
 assert.ok(booking.normalCustomerId);
 console.log('canonical booking handler integration: passed');
}finally{
 await prisma.$disconnect();
}
