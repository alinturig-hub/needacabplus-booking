import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Prisma } from '@/generated/prisma/client';

const url=process.env.CANONICAL_WRITER_TEST_URL;
if(!url || !/^postgresql?:\/\/[^@]+@127\.0\.0\.1:\d+\//.test(url)){
 throw new Error('Set CANONICAL_WRITER_TEST_URL to a disposable localhost PostgreSQL database.');
}
process.env.DATABASE_URL=url;

const {prisma}=await import('@/lib/prisma');
const {processCanonicalBookingEvent}=await import('@/lib/autocab/process-canonical-booking-event');
const {drainBookingPostCommitEffects}=await import('@/lib/autocab/booking-post-commit-outbox');

async function prepare(eventType:string,payload:Prisma.InputJsonObject){
 await prisma.webhookProvider.upsert({where:{id:'autocab'},create:{id:'autocab',name:'Autocab',baseUrl:'https://example.invalid',isEnabled:true},update:{}});
 const configuration=await prisma.autocabWebhookConfiguration.upsert({
  where:{eventType},create:{eventType,displayName:eventType,endpointSlug:eventType.toLowerCase()},update:{isEnabled:true},
 });
 const event=await prisma.webhookEvent.create({data:{eventType,payload,idempotencyKey:`test:${randomUUID()}`,webhookConfigurationId:configuration.id}});
 return event;
}

async function apply(eventType:string,payload:Prisma.InputJsonObject){
 const event=await prepare(eventType,payload);
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
 assert.equal(await prisma.bookingPostCommitEffect.count({where:{webhookEvent:{bookingId:booking.id}}}),3);
 const createdSnapshotCount=booking.snapshots.length;
 await processCanonicalBookingEvent(created.id);
 assert.equal(await prisma.bookingSnapshot.count({where:{bookingId:booking.id}}),createdSnapshotCount);

 const concurrentId=`writer-concurrent-${randomUUID()}`;
 const concurrent=await prepare('BookingCreated',{BookingId:concurrentId});
 await Promise.all([
  processCanonicalBookingEvent(concurrent.id),
  processCanonicalBookingEvent(concurrent.id),
  processCanonicalBookingEvent(concurrent.id),
 ]);
 assert.equal((await prisma.webhookEvent.findUniqueOrThrow({where:{id:concurrent.id}})).attemptCount,1);
 assert.equal(await prisma.bookingSnapshot.count({where:{webhookEventId:concurrent.id}}),1);
 assert.equal(await prisma.bookingPostCommitEffect.count({where:{webhookEventId:concurrent.id}}),1);

 const lateId=`writer-late-${randomUUID()}`;
 await apply('BookingComplete',{BookingId:lateId,EventTimestamp:'2026-10-14T11:00:00Z',Driver:{Id:'new-driver',BadgeNumber:'NEW'},Pricing:{Fare:20}});
 await apply('BookingCreated',{BookingId:lateId,EventTimestamp:'2026-10-14T09:00:00Z',Driver:{Id:'old-driver',BadgeNumber:'OLD'},Pricing:{Fare:5}});
 await apply('BookingCancelled',{BookingId:lateId,EventTimestamp:'2026-10-14T10:00:00Z'});
 const late=await prisma.booking.findUniqueOrThrow({where:{provider_externalId:{provider:'AUTOCAB',externalId:lateId}}});
 assert.equal(late.status,'COMPLETED');
 assert.equal(late.driverBadgeNumber,'NEW');
 assert.equal(Number(late.fare),20);
 assert.equal(late.cancelledAt,null);

 let calls=0;
 const server=createServer((_request,response)=>{
  calls++;
  response.writeHead(calls===1?503:200);
  response.end();
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();
  if(!address || typeof address==='string')throw new Error('Test server has no TCP port.');
  process.env.TAXICRM_BOOKING_EFFECTS_URL=`http://127.0.0.1:${address.port}/effects`;
  process.env.BOOKING_EFFECTS_SHARED_SECRET='local-test-secret';
  const first=await drainBookingPostCommitEffects(1);
  assert.deepEqual(first,{claimed:1,completed:0,failed:1});
  await prisma.bookingPostCommitEffect.updateMany({where:{status:'PENDING'},data:{nextAttemptAt:new Date(0)}});
  const second=await drainBookingPostCommitEffects(10);
  assert.ok(second.completed>=1);
  assert.equal(await prisma.bookingPostCommitEffect.count({where:{webhookEvent:{bookingId:booking.id},status:'DONE'}}),3);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
 console.log('canonical booking handler integration: passed');
}finally{
 await prisma.$disconnect();
}
