import type {BookingPolicy} from './booking-policy';
type ResolvedAddress=Record<string,unknown>;
export function buildAutocabQuoteRequest(input:{pickup:ResolvedAddress;destination:ResolvedAddress;vias:ResolvedAddress[];vehicle:string;scheduledAt:string|null},capabilities:number[],now=new Date(),rules?:BookingPolicy){
 const due=input.scheduledAt||new Date(now.getTime()+(rules?.priorityDelayMinutes||0)*60000).toISOString();
 const accountId=rules?.paymentMethod==='cash'?rules.cashAccountCustomerId:rules?.accountCustomerId;
 const point=(address:ResolvedAddress,type:string)=>({address:structuredClone(address),type,note:'',passengerDetailsIndex:null});
 return {companyId:rules?.companyId||1,...(accountId?{customerId:accountId}:{}),capabilities:[...new Set(rules?rules.bookingCapabilities:capabilities)],passengers:input.vehicle==='xl'?'6':'4',pickup:point(input.pickup,'Pickup'),destination:point(input.destination,'Destination'),vias:input.vias.map(v=>point(v,'Via')),pickupDueTime:due,pickupDueTimeUtc:due,driverConstraints:{forbiddenDrivers:[],requestedDrivers:[]},vehicleConstraints:{forbiddenVehicles:[],requestedVehicles:[]},hold:false};
}
