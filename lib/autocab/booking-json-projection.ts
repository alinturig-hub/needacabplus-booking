import {createHash} from 'node:crypto';
import type {Booking,Prisma} from '@/generated/prisma/client';
import {webhookDocument,mergeDocument,documentTimestamp} from './booking-json-document.mjs';
import {isObject} from './booking-mappers';
import {webhookOccurredAt} from './webhook-processing';

type Event={id:string;eventType:string;payload:unknown;receivedAt:Date};
type PreviousEvent=Pick<Event,'eventType'|'payload'|'receivedAt'>;
type Projection={raw_payload:Record<string,unknown>;last_event_occurred_at:Date;last_received_at:Date;raw_webhook_payload:unknown;last_webhook_event_id:string|null;last_event_type:string};

function canonicalSeed(booking:Booking|null,events:PreviousEvent[],externalId:string){
 let doc:Record<string,unknown>={id:externalId};
 if(booking){
  // Existing normalized values are only a seed for bookings predating this
  // projection. Do not synthesize default passenger counts or financial amounts.
  const pricing:Record<string,unknown>={};
  for(const field of ['fare','cost','price','accountAmount','cashAmount','cardAmount','extraCost','fixedCost','fixedPrice','chargingAreaCost','chargingAreaPrice','waitingTime','waitingTimeChargeable','gratuityAmount','costSource','pricingTariff','pricingSource'] as const){
   const value=booking[field];if(value!==null)pricing[field]=typeof value==='object'?Number(value):value;
  }
  if(Object.keys(pricing).length)doc.pricing=pricing;
  for(const [from,to] of [['companyId','companyId'],['typeOfBooking','bookingType'],['customerName','name'],['telephoneNumber','telephoneNumber'],['customerEmail','customerEmail'],['paymentType','paymentType'],['ourReference','ourReference']] as const){if(booking[from]!==null)doc[to]=booking[from]}
  // Canonical columns use timestamp-without-time-zone historically. Never
  // reinterpret them here: provider strings are authoritative for UTC projection.
  if(isObject(booking.rawPayload))doc=mergeDocument(doc,webhookDocument(booking.rawPayload,externalId));
 }
 for(const event of [...events].sort((a,b)=>webhookOccurredAt(b).getTime()-webhookOccurredAt(a).getTime())){
  if(isObject(event.payload))doc=mergeDocument(doc,webhookDocument(event.payload,externalId),true);
 }
 return doc;
}
export async function projectBookingJson(tx:Prisma.TransactionClient,options:{bookingId:string;externalId:string;event:Event;occurredAt:Date;preserveExisting:boolean;ignoreDriverAssignment:boolean;previousBooking:Booking|null;previousEvents:PreviousEvent[];operationalStatus:string}){
 const {bookingId,externalId,event,occurredAt}=options;
 // The canonical handler holds the per-booking transaction advisory lock.
 const seen=await tx.$queryRaw<{webhook_event_id:string}[]>`SELECT webhook_event_id FROM public.autocab_booking_document_events WHERE webhook_event_id=${event.id}`;
 if(seen.length)return;
 const [existing]=await tx.$queryRaw<Projection[]>`SELECT raw_payload,last_event_occurred_at,last_received_at,raw_webhook_payload,last_webhook_event_id,last_event_type FROM public.autocab_bookings WHERE autocab_id=${externalId} FOR UPDATE`;
 const patch=webhookDocument(event.payload as Record<string,unknown>,externalId);
 if(options.ignoreDriverAssignment){
  // Rejected offers must never become the assigned driver in the read model.
  for(const key of ['Driver','DriverDetails','DriverId','driver','driverId'])delete patch[key];
 }
 const preserve=options.preserveExisting||Boolean(existing&&existing.last_event_occurred_at>occurredAt);
 const doc=mergeDocument(existing?.raw_payload??canonicalSeed(options.previousBooking,options.previousEvents,externalId),patch,preserve);
 const raw=JSON.stringify(doc),hash=createHash('sha256').update(raw).digest('hex');
 const latestReceived=!existing||event.receivedAt>=existing.last_received_at;
 const latestOccurred=!existing||occurredAt>=existing.last_event_occurred_at;
 const value=(key:string)=>JSON.stringify(doc[key]??null);
 const string=(key:string)=>doc[key]==null?null:String(doc[key]);
 const archived=isObject(doc.archivedBooking)?doc.archivedBooking:null;
 await tx.$executeRaw`INSERT INTO public.autocab_bookings(
  autocab_id,company_id,booking_type,archive_reason,pickup_due_utc,booked_at_utc,
  pricing,archived_booking,pickup,destination,vias,raw_payload,payload_sha256,
  first_fetched_at,last_fetched_at,booking_id,raw_webhook_payload,last_webhook_event_id,
  last_event_type,last_event_occurred_at,last_received_at,operational_status)
 VALUES(${externalId},${string('companyId')},${string('bookingType')},${archived?.reason==null?null:String(archived.reason)},
  ${documentTimestamp(doc.pickupDueTimeUtc??doc.pickupDueTime)}::timestamptz,${documentTimestamp(doc.bookedAtTime)}::timestamptz,
  ${value('pricing')}::jsonb,${value('archivedBooking')}::jsonb,${value('pickup')}::jsonb,${value('destination')}::jsonb,${value('vias')}::jsonb,
  ${raw}::jsonb,${hash},${event.receivedAt},${event.receivedAt},${bookingId},
  ${JSON.stringify(latestReceived?event.payload:existing.raw_webhook_payload)}::jsonb,
  ${latestReceived?event.id:existing.last_webhook_event_id},${latestOccurred?event.eventType:existing.last_event_type},
  ${latestOccurred?occurredAt:existing.last_event_occurred_at},${latestReceived?event.receivedAt:existing.last_received_at},${options.operationalStatus})
 ON CONFLICT(autocab_id) DO UPDATE SET
  company_id=EXCLUDED.company_id,booking_type=EXCLUDED.booking_type,archive_reason=EXCLUDED.archive_reason,
  pickup_due_utc=EXCLUDED.pickup_due_utc,booked_at_utc=EXCLUDED.booked_at_utc,pricing=EXCLUDED.pricing,
  archived_booking=EXCLUDED.archived_booking,pickup=EXCLUDED.pickup,destination=EXCLUDED.destination,vias=EXCLUDED.vias,
  raw_payload=EXCLUDED.raw_payload,payload_sha256=EXCLUDED.payload_sha256,last_fetched_at=GREATEST(autocab_bookings.last_fetched_at,EXCLUDED.last_fetched_at),
  raw_webhook_payload=EXCLUDED.raw_webhook_payload,last_webhook_event_id=EXCLUDED.last_webhook_event_id,
  last_event_type=EXCLUDED.last_event_type,last_event_occurred_at=EXCLUDED.last_event_occurred_at,
  last_received_at=EXCLUDED.last_received_at,operational_status=EXCLUDED.operational_status,
  webhook_event_count=autocab_bookings.webhook_event_count+1`;
 await tx.$executeRaw`INSERT INTO public.autocab_booking_document_events(webhook_event_id,autocab_id,occurred_at) VALUES(${event.id},${externalId},${occurredAt})`;
}
