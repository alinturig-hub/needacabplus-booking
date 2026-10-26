import type {FareQuote} from './quotes';
export type PublicFareQuote=Pick<FareQuote,'id'|'vehicle'|'service'|'scheduledAt'|'pickup'|'destination'|'vias'|'totalPence'|'expiresAt'|'currency'|'paymentMethod'|'liveBooking'>&{smartFareApplied?:boolean;originalTotalPence?:number;promotionSavingPence?:number;standardTotalPence?:number;membershipTier?:string;membershipSavingPence?:number};
export function publicFareQuote(quote:FareQuote):PublicFareQuote{
 const {id,vehicle,service,scheduledAt,pickup,destination,vias,totalPence,expiresAt,currency,paymentMethod,liveBooking}=quote;
 const original=quote.membership?.standardTotalPence??(quote.smartFare?.applied?quote.smartFare.normalPence:totalPence);
 return {...(original>totalPence?{originalTotalPence:original,promotionSavingPence:original-totalPence}:{}),liveBooking:Boolean(liveBooking),id,vehicle,service,scheduledAt,pickup,destination,vias,totalPence,expiresAt,currency,...(paymentMethod?{paymentMethod}:{}),...(quote.smartFare?.applied?{smartFareApplied:true}:{}),...(quote.membership?{standardTotalPence:quote.membership.standardTotalPence,membershipTier:quote.membership.tierName,membershipSavingPence:quote.membership.savingPence}:{})};
}
