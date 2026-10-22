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
 async function document(id:string){return (await prisma.$queryRaw<{raw_payload:Record<string,unknown>;raw_webhook_payload:unknown;operational_status:string;webhook_event_count:bigint;pickup_due_utc:Date|null}[]>`SELECT raw_payload,raw_webhook_payload,operational_status,webhook_event_count,pickup_due_utc FROM autocab_bookings WHERE autocab_id=${id}`)[0]}
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
 const doc=await document(externalId);
 assert.equal(doc.operational_status,'COMPLETED');
 assert.equal(doc.raw_payload.name,'Updated Passenger');
 assert.equal(Number(doc.webhook_event_count),5,'Replayed event cannot duplicate JSON projection');
 assert.equal((doc.raw_payload.pickup as {address:{text:string}}).address.text,'1 Test Street');
 assert.equal((await prisma.$queryRaw<{n:bigint}[]>`SELECT count(*) AS n FROM autocab_booking_document_events WHERE autocab_id=${externalId}`)[0].n,BigInt(5));

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
 const lateDoc=await document(lateId);
 assert.equal((lateDoc.raw_payload.pricing as {fare:number}).fare,20);
 assert.equal(lateDoc.operational_status,'COMPLETED');

 const jsonId=`writer-json-${randomUUID()}`;
 const jsonCreated=await apply('BookingCreated',{BookingId:jsonId,EventTimestamp:'2026-10-18T10:00:00Z',TypeOfBooking:'ASAP',BookingType:'Active',PickupDueTime:'2026-10-18T12:00:00',Pricing:{Price:15,Cost:9,FutureFee:{amount:1}},Vias:[{Address:'Via'}],FutureExtension:{all:'retained'}});
 await apply('BookingModified',{BookingId:jsonId,EventTimestamp:'2026-10-18T11:00:00Z',Pricing:{Price:0}});
 let jsonDoc=await document(jsonId);
 assert.deepEqual(jsonDoc.raw_payload.pricing,{price:0,cost:9,FutureFee:{amount:1}});
 assert.deepEqual(jsonDoc.raw_payload.FutureExtension,{all:'retained'});
 assert.equal(jsonDoc.raw_payload.bookingType,'ASAP');
 assert.equal(jsonDoc.pickup_due_utc?.toISOString(),'2026-10-18T11:00:00.000Z');
 await apply('BookingModified',{BookingId:jsonId,EventTimestamp:'2026-10-18T12:00:00Z',Pricing:null,Vias:[]});
 await apply('BookingModified',{BookingId:jsonId,EventTimestamp:'2026-10-18T09:00:00Z',Pricing:{Price:100},Vias:[{Address:'Too old'}]});
 jsonDoc=await document(jsonId);
 assert.equal(jsonDoc.raw_payload.pricing,null);assert.deepEqual(jsonDoc.raw_payload.vias,[]);
 assert.equal((jsonDoc.raw_webhook_payload as {Pricing:{Price:number}}).Pricing.Price,100,'Exact delayed payload remains available separately');
 await processCanonicalBookingEvent(jsonCreated.id);
 assert.equal(Number((await document(jsonId)).webhook_event_count),4);

 const detailsId=`writer-detail-${randomUUID()}`;
 await apply('BookingCreated',{BookingId:detailsId,EventTimestamp:'2026-10-22T05:00:00Z',Driver:{Id:51,Forename:'Saved',Surname:'Driver',Mobile:'test-phone'},Vehicle:{Id:81,Callsign:'11',Registration:'AB12 CDE',Make:'Snapshot make'},Pickup:{Address:'Fixture station',Zone:{Id:12,Name:'Station'},Coordinates:{Latitude:50.3,Longitude:-4.1}},Vias:[{Address:'Fixture via',Zone:{Id:13},Coordinates:{Latitude:50.4,Longitude:-4.2}}]});
 await apply('BookingModified',{BookingId:detailsId,EventTimestamp:'2026-10-22T05:01:00Z',Driver:{Id:51},Vehicle:{Id:81},Pickup:{Address:'Fixture station'},Vias:[{Address:'Fixture via'}]});
 let savedDetails=await prisma.booking.findUniqueOrThrow({where:{provider_externalId:{provider:'AUTOCAB',externalId:detailsId}},include:{locations:true}});
 assert.equal((savedDetails.assignmentDetails as {driver:{phone:string}}).driver.phone,'test-phone');
 assert.equal((savedDetails.assignmentDetails as {vehicle:{make:string}}).vehicle.make,'Snapshot make');
 const savedVia=await prisma.bookingVia.findFirstOrThrow({where:{bookingId:savedDetails.id}});assert.equal(savedVia.zoneId,'13');assert.equal(Number(savedVia.latitude),50.4);
 assert.equal(savedDetails.vehicleRegistration,'AB12 CDE');assert.equal(savedDetails.locations[0].zoneId,'12');assert.equal(Number(savedDetails.locations[0].latitude),50.3);
 await apply('BookingModified',{BookingId:detailsId,EventTimestamp:'2026-10-22T05:02:00Z',Vehicle:{Id:82}});
 savedDetails=await prisma.booking.findUniqueOrThrow({where:{provider_externalId:{provider:'AUTOCAB',externalId:detailsId}},include:{locations:true}});
 assert.equal(savedDetails.vehicleRegistration,null);assert.equal((savedDetails.assignmentDetails as {vehicle:{make?:string}}).vehicle.make,undefined);
 await apply('BookingModified',{BookingId:detailsId,EventTimestamp:'2026-10-22T05:03:00Z',Driver:null,Vehicle:null});
 savedDetails=await prisma.booking.findUniqueOrThrow({where:{provider_externalId:{provider:'AUTOCAB',externalId:detailsId}},include:{locations:true}});
 assert.equal(savedDetails.driverId,null);assert.equal(savedDetails.vehicleId,null);assert.equal((savedDetails.assignmentDetails as {driver:unknown}).driver,null);

 const rejectedId=`writer-json-rejected-${randomUUID()}`;
 await apply('BookingCreated',{BookingId:rejectedId,EventTimestamp:'2026-10-18T10:00:00Z'});
 await apply('BookingRejected',{BookingId:rejectedId,EventTimestamp:'2026-10-18T11:00:00Z',Driver:{Id:'not-assigned'},Vehicle:{Id:'not-assigned-car'}});
 const rejectedDoc=await document(rejectedId);
 assert.equal(rejectedDoc.raw_payload.driver,undefined);assert.equal(rejectedDoc.raw_payload.vehicle,undefined);
 assert.equal(rejectedDoc.operational_status,'REJECTED');

 const blockedId=`writer-json-atomic-${randomUUID()}`;
 // Simulate a read-model storage failure: all canonical effects must roll back.
 await prisma.$executeRawUnsafe(`ALTER TABLE autocab_bookings ADD CONSTRAINT projection_failure_fixture CHECK(autocab_id <> '${blockedId}')`);
 try{
  const blocked=await prepare('BookingCreated',{BookingId:blockedId});
  await assert.rejects(processCanonicalBookingEvent(blocked.id));
  assert.equal(await prisma.booking.count({where:{externalId:blockedId}}),0);
  assert.equal(await prisma.bookingSnapshot.count({where:{webhookEventId:blocked.id}}),0);
  assert.equal((await prisma.webhookEvent.findUniqueOrThrow({where:{id:blocked.id}})).status,'FAILED');
 }finally{await prisma.$executeRawUnsafe('ALTER TABLE autocab_bookings DROP CONSTRAINT projection_failure_fixture')}


 const lifecycleId=`writer-lifecycle-${randomUUID()}`;
 for(const [eventType,status] of [
  ['BookingCreated','CREATED'],
  ['BookingDispatched','DISPATCHED'],
  ['BookingDispatchAccepted','ACCEPTED'],
  ['BookingArrived','ARRIVED'],
  ['BookingPOB','POB'],
  ['BookingComplete','COMPLETED'],
 ] as const){
  await apply(eventType,{BookingId:lifecycleId});
  const current=await prisma.booking.findUniqueOrThrow({where:{provider_externalId:{provider:'AUTOCAB',externalId:lifecycleId}}});
  assert.equal(current.status,status,`${eventType} must set ${status}`);
 }
 for(const [terminalEvent,terminalStatus,timestampField] of [
  ['BookingCancelled','CANCELLED','cancelledAt'],
  ['BookingNoFare','NO_FARE','noFareAt'],
 ] as const){
  const id=`writer-terminal-${randomUUID()}`;
  await apply('BookingCreated',{BookingId:id});
  await apply(terminalEvent,{BookingId:id});
  const current=await prisma.booking.findUniqueOrThrow({where:{provider_externalId:{provider:'AUTOCAB',externalId:id}}});
  assert.equal(current.status,terminalStatus);
  assert.ok(current[timestampField]);
 }

 const delayedTerminalId=`writer-delayed-terminal-${randomUUID()}`;
 await apply('BookingCreated',{BookingId:delayedTerminalId,EventTimestamp:'2026-10-14T09:00:00Z'});
 await apply('BookingDispatched',{BookingId:delayedTerminalId,EventTimestamp:'2026-10-14T11:00:00Z'});
 await apply('BookingCancelled',{BookingId:delayedTerminalId,EventTimestamp:'2026-10-14T10:00:00Z'});
 const delayedTerminal=await prisma.booking.findUniqueOrThrow({where:{provider_externalId:{provider:'AUTOCAB',externalId:delayedTerminalId}}});
 assert.equal(delayedTerminal.status,'DISPATCHED','An older cancellation must not undo a newer dispatch');
 assert.equal(delayedTerminal.cancelledAt,null);

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
  let completed=0;
  for(let attempt=0;attempt<5;attempt++){
   const batch=await drainBookingPostCommitEffects(25);
   completed+=batch.completed;
   if(await prisma.bookingPostCommitEffect.count({where:{webhookEvent:{bookingId:booking.id},status:'DONE'}})===3)break;
   await prisma.bookingPostCommitEffect.updateMany({where:{status:'PENDING'},data:{nextAttemptAt:new Date(0)}});
  }
  assert.ok(completed>=1);
  assert.equal(await prisma.bookingPostCommitEffect.count({where:{webhookEvent:{bookingId:booking.id},status:'DONE'}}),3);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
 console.log('canonical booking handler integration: passed');
}finally{
 await prisma.$disconnect();
}
