type ResolvedAddress=Record<string,unknown>;
export function buildAutocabQuoteRequest(input:{pickup:ResolvedAddress;destination:ResolvedAddress;vias:ResolvedAddress[];vehicle:string;scheduledAt:string|null},capabilities:number[],now=new Date()){
 const due=input.scheduledAt||now.toISOString();
 const point=(address:ResolvedAddress,type:string)=>({address:structuredClone(address),type,note:'',passengerDetailsIndex:null});
 return {companyId:1,capabilities:[...new Set(capabilities)],passengers:input.vehicle==='xl'?'6':'4',pickup:point(input.pickup,'Pickup'),destination:point(input.destination,'Destination'),vias:input.vias.map(v=>point(v,'Via')),pickupDueTime:due,pickupDueTimeUtc:due,driverConstraints:{forbiddenDrivers:[],requestedDrivers:[]},vehicleConstraints:{forbiddenVehicles:[],requestedVehicles:[]},hold:false};
}
