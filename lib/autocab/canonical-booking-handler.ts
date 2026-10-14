import { Prisma } from '@/generated/prisma/client';
import { persistBookingEvent } from '@/lib/autocab/booking-event-persistence';
import { normaliseEventType } from '@/lib/autocab/webhook-processing';
import type { BookingOperationalStatus } from '@/lib/autocab/booking-state';

type BookingEventDefinition = {
 title: string;
 description: string;
 status?: BookingOperationalStatus;
};

// Keep these definitions in step with TaxiCRM's booking event registry while
// the two applications share the same webhook inbox.
const definitions: Record<string, BookingEventDefinition> = {
 bookingcreated: {title:'Booking Created',description:'Booking created in Autocab.',status:'CREATED'},
 bookingdispatched: {title:'Booking Dispatched',description:'Booking dispatched to a driver.',status:'DISPATCHED'},
 bookingdispatchaccepted: {title:'Dispatch Accepted',description:'Driver accepted the booking dispatch.',status:'ACCEPTED'},
 bookingarrived: {title:'Driver Arrived',description:'Driver arrived at the pickup location.',status:'ARRIVED'},
 bookingpob: {title:'Passenger On Board',description:'Passenger boarded the vehicle.',status:'POB'},
 bookingcomplete: {title:'Booking Completed',description:'Booking completed successfully.',status:'COMPLETED'},
 bookingnofare: {title:'No Fare',description:'Booking ended without a fare.',status:'NO_FARE'},
 bookingcancelled: {title:'Booking Cancelled',description:'Booking was cancelled.',status:'CANCELLED'},
 bookingrejected: {title:'Booking Rejected',description:'Booking dispatch was rejected.',status:'REJECTED'},
 bookingrecovered: {title:'Booking Recovered',description:'Booking recovered and returned to the dispatch workflow.',status:'DISPATCHED'},
 bookingrunninglate: {title:'Booking Running Late',description:'Booking reported as running late by Autocab.'},
 bookingmodified: {title:'Booking Modified',description:'Booking details were modified.'},
};

export function isCanonicalBookingEvent(eventType: string): boolean {
 return normaliseEventType(eventType) in definitions;
}

// The worker calls this only after the exclusive writer switch is enabled.
export async function applyCanonicalBookingEvent(
 tx: Prisma.TransactionClient,
 webhookEventId: string,
 eventType: string,
) {
 const definition=definitions[normaliseEventType(eventType)];
 if(!definition)throw new Error('Unsupported canonical booking event.');
 const result=await persistBookingEvent(tx,webhookEventId,definition);
 if(definition.status){
  await tx.bookingPostCommitEffect.create({data:{webhookEventId}});
 }
 return result;
}
