export type SimulationRules={arrivalMinutes:number;bufferMinutes:number;offerSeconds:number;candidateCount:number;maxEtaMinutes:number;fallbackSpeedMph:number;detourFactor:number};
export const simulationDefaults:SimulationRules={arrivalMinutes:5,bufferMinutes:2,offerSeconds:25,candidateCount:3,maxEtaMinutes:30,fallbackSpeedMph:18,detourFactor:1.4};
export type Candidate={vehicleId:string;label:string;etaSeconds:number};

// Pure planning only: never sends an offer or reserves a driver.
export function simulateDispatch(pickupAt:number,now:number,candidates:Candidate[],rules:SimulationRules,rejected:string[]=[],accepted?:string){
 if(!Number.isFinite(pickupAt)||!Number.isFinite(now))throw new Error('Choose a valid pickup time.');
 if(Object.values(rules).some(value=>!Number.isFinite(value)||value<0)||rules.candidateCount<1)throw new Error('Invalid simulation rules.');
 const seen=new Set<string>();
 const ranked=candidates.filter(car=>{
  if(seen.has(car.vehicleId)||rejected.includes(car.vehicleId)||!Number.isFinite(car.etaSeconds)||car.etaSeconds<0||car.etaSeconds>rules.maxEtaMinutes*60)return false;
  seen.add(car.vehicleId);return true;
 }).sort((a,b)=>a.etaSeconds-b.etaSeconds||a.vehicleId.localeCompare(b.vehicleId)).slice(0,rules.candidateCount);
 const targetAt=pickupAt-rules.arrivalMinutes*60000;
 const acceptedCar=accepted?candidates.find(car=>car.vehicleId===accepted):undefined;
 if(accepted)return {state:'accepted' as const,targetAt,candidates:ranked,recommended:null,dispatchAt:null,midpointSeconds:null,arrivalAt:acceptedCar?now+acceptedCar.etaSeconds*1000:null,warning:'Accepted: no further offers. Check the assigned vehicle’s latest ETA.'};
 if(!ranked.length)return {state:'unavailable' as const,targetAt,candidates:ranked,recommended:null,dispatchAt:null,midpointSeconds:null,arrivalAt:null,warning:'No eligible vehicles with a usable travel time.'};
 const midpointSeconds=(ranked[0].etaSeconds+ranked[ranked.length-1].etaSeconds)/2;
 // Include each driver's acceptance window, including the final backup's.
 const reserveSeconds=Math.max(...ranked.map((car,index)=>car.etaSeconds+(index+1)*rules.offerSeconds))+rules.bufferMinutes*60;
 const dispatchAt=targetAt-reserveSeconds*1000;
 const arrivalAt=Math.max(now,dispatchAt)+(ranked[0].etaSeconds+rules.offerSeconds)*1000;
 const late=now+reserveSeconds*1000>targetAt;
 return {state:late?'at-risk' as const:now>=dispatchAt?'due' as const:'waiting' as const,targetAt,candidates:ranked,recommended:ranked[0],dispatchAt,midpointSeconds,arrivalAt,warning:late?'The full backup margin is no longer available. Review this booking.':ranked.length<2?'Only one candidate: no backup is available.':null};
}

export function dispatchEventKind(event:string){
 const key=event.toLowerCase().replace(/[^a-z]/g,'');
 if(['bookingaccepted','bookingdispatchaccepted'].includes(key))return 'accepted';
 if(['bookingdispatch','bookingdispatched','bookingdispatchoffered'].includes(key))return 'offered';
 if(['bookingrejected','bookingdispatchrejected'].includes(key))return 'rejected';
 return null;
}
