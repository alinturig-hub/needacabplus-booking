import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

const url=process.env.CANONICAL_WRITER_TEST_URL;
if(!url || !/^postgresql?:\/\/[^@]+@127\.0\.0\.1:\d+\//.test(url)){
 throw new Error('Set CANONICAL_WRITER_TEST_URL to a disposable localhost PostgreSQL database.');
}
process.env.DATABASE_URL=url;

const {prisma}=await import('@/lib/prisma');
const {processCanonicalBookingEvent}=await import('@/lib/autocab/process-canonical-booking-event');

async function apply(eventType:string,payload:Prisma.InputJsonObject){
 await prisma.webhookProvider.upsert({where:{id:'autocab'},create:{id:'autocab',name:'Autocab',baseUrl:'https://example.invalid',isEnabled:true},update:{}});
 const configuration=await prisma.autocabWebhookConfiguration.upsert({
  where:{eventType},create:{eventType,displayName:eventType,endpointSlug:eventType.toLowerCase()},update:{isEnabled:true},
 });
 const event=await prisma.webhookEvent.create({data:{eventType,payload,idempotencyKey:`test:${randomUUID()}`,webhookConfigurationId:configuration.id}});
 await processCanonicalBookingEvent(event.id);
 return event;
}

try{
 const externalId=`writer-test-${randomUUID()}`;
 await prisma.webhookProvider.upsert({where:{id:'autocab'},create:{id:'autocab',name:'Autocab',baseUrl:'https://example.invalid',isEnabled:true},update:{}});
 const modifiedConfig=await prisma.autocabWebhookConfiguration.upsert({where:{eventType:'BookingModified'},create:{eventType:'BookingModified',displayName:'BookingModified',endpointSlug:'bookingmodified'},update:{isEnabled:true}});
 const earlyEventId=await prisma.webhookEvent.create({data:{eventType:'BookingModified',payload:{BookingId:externalId,Name:'Before parent'},idempotencyKey:`test:${randomUUID()}`,webhookConfigurationId:modifiedConfig.id}});
 // A context event with no parent is retryable, not a partial booking.
 await assert.rejects(processCanonicalBookingEvent(earlyEventId.id),/waiting for its booking/);
 assert.equal((await prisma.webhookEvent.findUniqueOrThrow({where:{id:earlyEventId.id}})).status,'FAILED');
 const created=await apply('BookingCreated',{
  BookingId:externalId,Name:'Test Passenger',TelephoneNumber:'07123456789',
  Pickup:{Address:'1 Test Street'},Destination:{Address:'2 Test Street'},
 });
 await processCanonicalBookingEvent(earlyEventId.id);
 await apply('BookingComplete',{BookingId:externalId,Name:'Test Passenger'});
 await apply('BookingModified',{BookingId:externalId,Name:'Updated Passenger'});
 // A delayed active event must not regress a completed booking.
 await apply('BookingDispatched',{BookingId:externalId,Name:'Stale Passenger'});
 const booking=await prisma.booking.findUniqueOrThrow({
  where:{provider_externalId:{provider:'AUTOCAB',externalId}},
  include:{locations:true,timelineEvents:true,snapshots:true},
 });
 assert.equal(booking.id,(await prisma.webhookEvent.findUniqueOrThrow({where:{id:created.id}})).bookingId);
 assert.equal(booking.status,'COMPLETED');
 assert.equal(booking.customerName,'Updated Passenger');
 assert.equal(booking.locations.length,2);
 assert.equal(booking.timelineEvents.length,5);
 assert.equal(booking.snapshots.length,5);
 assert.ok(booking.normalCustomerId);
 const createdSnapshotCount=booking.snapshots.length;
 await processCanonicalBookingEvent(created.id);
 assert.equal(await prisma.bookingSnapshot.count({where:{bookingId:booking.id}}),createdSnapshotCount);
 console.log('canonical booking handler integration: passed');
}finally{
 await prisma.$disconnect();
}
