import {z} from 'zod';
import type {FareQuote} from './quotes';

const amount=z.number().finite().nonnegative().max(100000);
export const passengerDetailsSchema=z.object({
 name:z.string().trim().min(2).max(100),telephoneNumber:z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/),
 customerEmail:z.string().email().max(250),passengers:z.number().int().min(1).max(6),luggage:z.number().int().min(0).max(20),
 driverNote:z.string().trim().max(300).default(''),
}).strict();

// These are independent operator cost fields, never the passenger fare.
export function readAutocabCosts(response:unknown){
 const parsed=z.object({outward:z.object({cost:amount,bookingCost:amount})}).safeParse(response);
 return parsed.success?parsed.data.outward:undefined;
}

export function buildAutocabBookingRequest(quote:FareQuote,details:z.infer<typeof passengerDetailsSchema>,now=new Date()){
 const passenger=passengerDetailsSchema.parse(details);
 if(!quote.autocabRequest)throw new Error('Request a new quote containing resolved Autocab addresses.');
 const costs=z.object({cost:amount,bookingCost:amount}).safeParse(quote.autocabCosts);
 if(!costs.success)throw new Error('The quote has no verified Autocab cost and bookingCost. Request a new quote.');
 if(!Number.isFinite(Date.parse(quote.expiresAt))||Date.parse(quote.expiresAt)<=now.getTime())throw new Error('The quote has expired.');
 if(!Number.isSafeInteger(quote.totalPence)||quote.totalPence<=0)throw new Error('The final fare is invalid.');
 const quotedCapacity=Number(quote.autocabRequest.passengers);
 if(!Number.isInteger(quotedCapacity)||passenger.passengers>quotedCapacity)throw new Error('Passenger count exceeds the quoted vehicle capacity.');
 const due=quote.service==='priority'?new Date(now.getTime()+(quote.bookingRules?.priorityDelayMinutes||0)*60000).toISOString():quote.scheduledAt;
 if(!due||!Number.isFinite(Date.parse(due))||Date.parse(due)<now.getTime())throw new Error('Invalid pickup time.');
 const source=quote.autocabRequest;
 // Whitelist the documented fields; quote examples and account/return IDs must not leak in.
 return {
  companyId:source.companyId,...(source.customerId?{customerId:source.customerId,yourReferences:{yourReference1:`NAC-${quote.id}`}}:{}),capabilities:[...source.capabilities],bookingSource:'ThirdPartyWebsite',
  ...passenger,officeNote:`WebApp payment method: ${quote.paymentMethod||'card'}. Payment is not confirmed by this request.`,passengers:String(passenger.passengers),ourReference:`NAC-${quote.id}`,
  pickup:structuredClone(source.pickup),destination:structuredClone(source.destination),vias:structuredClone(source.vias),
  driverConstraints:structuredClone(source.driverConstraints),vehicleConstraints:structuredClone(source.vehicleConstraints),
  pickupDueTime:due,pickupDueTimeUtc:due,
  pricing:{...costs.data,price:quote.totalPence/100,bookingPrice:quote.totalPence/100,isManual:true,pricingTariff:'Manually Entered'},
  // Creation is held until payment and the documented release/dispatch flow are implemented.
  hold:true,
 };
}

export function bookingCreateUrl(baseUrl:string,path:string,method:string){
 const url=new URL(path,`${baseUrl.replace(/\/$/,'')}/`);
 if(url.protocol!=='https:'||method.toUpperCase()!=='POST'||url.pathname!=='/booking/v1/booking')throw new Error('Configure booking.create as POST /booking/v1/booking.');
 // No automatic override of Autocab warnings, including a value saved in configuration.
 url.search='';return url;
}
