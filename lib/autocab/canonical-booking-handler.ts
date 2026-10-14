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

// Current Autocab webhook configuration uses these names when the payload does
// not contain an EventType. Retain support for rows already saved with them.
const configuredAliases: Record<string, string> = {
 AUTOCAB_NEW_BOOKING: 'bookingcreated',
 AUTOCAB_BOOKING_MODIFIED: 'bookingmodified',
 AUTOCAB_BOOKING_DISPACHED: 'bookingdispatched',
 AUTOCAB_BOOKING_ACCEPTED: 'bookingdispatchaccepted',
 AUTOCAB_BOOKING_DAP: 'bookingarrived',
 AUTOCAB_BOOKING_POB: 'bookingpob',
 AUTOCAB_BOOKING_COMPLETED: 'bookingcomplete',
 AUTOCAB_BOOKING_CANCELLED: 'bookingcancelled',
 AUTOCAB_BOOKING_NOFARE: 'bookingnofare',
 AUTOCAB_BOOKING_REJECTED: 'bookingrejected',
 AUTOCAB_BOOKING_RECOVERED: 'bookingrecovered',
 AUTOCAB_RUNNING_LATE: 'bookingrunninglate',
};

export const canonicalBookingAliasTypes = Object.keys(configuredAliases);

function canonicalBookingKey(eventType: string) {
 return configuredAliases[eventType] || normaliseEventType(eventType);
}

export function isCanonicalBookingEvent(eventType: string): boolean {
 return canonicalBookingKey(eventType) in definitions;
}

// The worker calls this only after the exclusive writer switch is enabled.
export async function applyCanonicalBookingEvent(
 tx: Prisma.TransactionClient,
 webhookEventId: string,
 eventType: string,
) {
 const definition=definitions[canonicalBookingKey(eventType)];
 if(!definition)throw new Error('Unsupported canonical booking event.');
 const result=await persistBookingEvent(tx,webhookEventId,definition);
 if(definition.status){
  await tx.bookingPostCommitEffect.create({data:{webhookEventId}});
 }
 return result;
}
