import type {FareQuote} from './quotes';
export type PublicFareQuote=Pick<FareQuote,'id'|'vehicle'|'service'|'scheduledAt'|'pickup'|'destination'|'vias'|'totalPence'|'expiresAt'|'currency'|'paymentMethod'|'liveBooking'>;
export function publicFareQuote(quote:FareQuote):PublicFareQuote{
 const {id,vehicle,service,scheduledAt,pickup,destination,vias,totalPence,expiresAt,currency,paymentMethod,liveBooking}=quote;
 return {liveBooking:Boolean(liveBooking),id,vehicle,service,scheduledAt,pickup,destination,vias,totalPence,expiresAt,currency,...(paymentMethod?{paymentMethod}:{})};
}
