export type Receipt={id:string;kind:string|null;event_type:string;booking_id:string|null;vehicle_id:string|null;driver_id:string|null;driver_callsign?:string|null;vehicle_callsign?:string|null;customer_key?:string|null;source_at?:string|null;received_at:string;dedup_key?:string|null};
export function receiptTime(row:Receipt){return Date.parse(row.source_at||row.received_at)}
// Event clocks and delivery clocks cannot be mixed into a journey duration.
export function elapsedSeconds(start:Receipt,end:Receipt){
 if(Boolean(start.source_at)!==Boolean(end.source_at))return null;
 const seconds=(receiptTime(end)-receiptTime(start))/1000;
 return Number.isFinite(seconds)&&seconds>0?seconds:null;
}
export function receiptActor(row:Receipt){return row.driver_callsign?`Driver ${row.driver_callsign}`:row.driver_id?`Driver ID ${row.driver_id}`:row.vehicle_callsign?`Vehicle ${row.vehicle_callsign}`:row.vehicle_id?`Vehicle ID ${row.vehicle_id}`:'Driver not identified'}
export function receiptText(row:Receipt){const actor=receiptActor(row);const names:Record<string,string>={created:'Booking received — awaiting dispatch',offered:`Job offered to ${actor}`,rejected:`${actor} rejected the job`,accepted:`${actor} accepted — awaiting arrival`,recovered:'Job recovered — available for another offer',arrived:`${actor} arrived at pickup`,onboard:'Passenger on board',completed:'Journey completed',cancelled:'Booking cancelled',late:'Running late reported',no_fare:'No fare reported'};return names[row.kind||'']||row.event_type}
export function bookingMetrics(input:Receipt[]){
 const seen=new Set<string>();
 const rows=input.filter(row=>{if(row.dedup_key){if(seen.has(row.dedup_key))return false;seen.add(row.dedup_key)}return Number.isFinite(receiptTime(row))}).sort((a,b)=>receiptTime(a)-receiptTime(b)||Number(a.id)-Number(b.id));
 const attempts:{offer:Receipt;response:Receipt|null;responseSeconds:number|null}[]=[];
 let firstAccepted:Receipt|undefined;
 for(const row of rows){
  if(row.kind==='offered'){
   const previous=attempts.at(-1);
   if(previous&&!previous.response&&((row.driver_id&&row.driver_id===previous.offer.driver_id)||(!row.driver_id&&row.vehicle_id&&row.vehicle_id===previous.offer.vehicle_id)))continue;
   attempts.push({offer:row,response:null,responseSeconds:null});
  }
  if(row.kind==='accepted'||row.kind==='rejected'){
   const attempt=[...attempts].reverse().find(item=>!item.response&&receiptTime(item.offer)<=receiptTime(row)&&((row.driver_id&&item.offer.driver_id===row.driver_id)||(!row.driver_id&&row.vehicle_id&&item.offer.vehicle_id===row.vehicle_id)));
   if(attempt){attempt.response=row;attempt.responseSeconds=elapsedSeconds(attempt.offer,row);if(row.kind==='accepted'&&!firstAccepted)firstAccepted=row}
  }
 }
 const firstOffer=attempts[0]?.offer;
 const arrivals=rows.filter(row=>row.kind==='arrived');
 const acceptance=rows.find(row=>row.kind==='accepted');
 const arrival=arrivals.find(row=>acceptance&&receiptTime(row)>=receiptTime(acceptance)&&((acceptance.driver_id&&row.driver_id===acceptance.driver_id)||(!acceptance.driver_id&&acceptance.vehicle_id&&row.vehicle_id===acceptance.vehicle_id)));
 return {rows,attempts,offerToAcceptSeconds:firstOffer&&firstAccepted?elapsedSeconds(firstOffer,firstAccepted):null,acceptToArrivalSeconds:acceptance&&arrival?elapsedSeconds(acceptance,arrival):null,receiptTimed:rows.some(row=>!row.source_at)};
}
export function aggregateDispatch(rows:Receipt[]){
 const groups=new Map<string,Receipt[]>();for(const row of rows){if(row.booking_id&&Number.isFinite(receiptTime(row)))groups.set(row.booking_id,[...(groups.get(row.booking_id)||[]),row])}
 const drivers=new Map<string,{id:string;label:string;offers:number;accepted:number;rejected:number;responseSeconds:number[];bookings:Set<string>}>();
 const customers=new Map<string,{id:string;bookings:Set<string>;completed:Set<string>;cancelled:Set<string>;dispatchSeconds:number[]}>();
 const days=new Map<string,{day:string;bookings:number;dispatchSeconds:number[]}>();
 const dispatchSeconds:number[]=[];
 let matchedResponses=0,unusableResponseTimes=0,sourceTimedResponses=0,receiptTimedResponses=0;
 for(const [bookingId,events] of groups){
  const metrics=bookingMetrics(events);const elapsed=metrics.offerToAcceptSeconds;if(elapsed!==null)dispatchSeconds.push(elapsed);
  const day=new Date(receiptTime(metrics.rows[0])).toLocaleDateString('en-CA',{timeZone:'Europe/London'});const trend=days.get(day)||{day,bookings:0,dispatchSeconds:[]};trend.bookings++;if(elapsed!==null)trend.dispatchSeconds.push(elapsed);days.set(day,trend);
  for(const attempt of metrics.attempts){
   if(attempt.response){matchedResponses++;if(attempt.responseSeconds===null)unusableResponseTimes++;else if(attempt.offer.source_at)sourceTimedResponses++;else receiptTimedResponses++}
   const id=attempt.offer.driver_id;if(!id)continue;const driver=drivers.get(id)||{id,label:receiptActor(attempt.offer),offers:0,accepted:0,rejected:0,responseSeconds:[],bookings:new Set<string>()};driver.offers++;driver.bookings.add(bookingId);if(attempt.response?.kind==='accepted')driver.accepted++;if(attempt.response?.kind==='rejected')driver.rejected++;if(attempt.responseSeconds!==null)driver.responseSeconds.push(attempt.responseSeconds);drivers.set(id,driver)}
  const key=events.find(row=>row.customer_key)?.customer_key;if(key){const profile=customers.get(key)||{id:key,bookings:new Set<string>(),completed:new Set<string>(),cancelled:new Set<string>(),dispatchSeconds:[]};profile.bookings.add(bookingId);if(events.some(row=>row.kind==='completed'))profile.completed.add(bookingId);if(events.some(row=>row.kind==='cancelled'))profile.cancelled.add(bookingId);if(elapsed!==null)profile.dispatchSeconds.push(elapsed);customers.set(key,profile)}
 }
 const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
 const sorted=[...dispatchSeconds].sort((a,b)=>a-b);
 return {bookings:groups.size,measuredBookings:dispatchSeconds.length,meanDispatchSeconds:mean(dispatchSeconds),p90DispatchSeconds:sorted.length?sorted[Math.ceil(sorted.length*.9)-1]:null,unlinkedEvents:rows.filter(row=>!row.booking_id).length,timingQuality:{matchedResponses,unusableResponseTimes,sourceTimedResponses,receiptTimedResponses},
  drivers:[...drivers.values()].map(row=>({id:row.id,label:row.label,offers:row.offers,accepted:row.accepted,rejected:row.rejected,unresolved:row.offers-row.accepted-row.rejected,meanResponseSeconds:mean(row.responseSeconds),measuredResponses:row.responseSeconds.length,bookingCount:row.bookings.size})).sort((a,b)=>b.offers-a.offers),
  customers:[...customers.values()].map(row=>({id:row.id,label:`Contact ${row.id.slice(0,8)}`,bookings:row.bookings.size,completed:row.completed.size,cancelled:row.cancelled.size,meanDispatchSeconds:mean(row.dispatchSeconds),measuredBookings:row.dispatchSeconds.length})).sort((a,b)=>b.bookings-a.bookings),
  days:[...days.values()].map(row=>({day:row.day,bookings:row.bookings,meanDispatchSeconds:mean(row.dispatchSeconds),measuredBookings:row.dispatchSeconds.length})).sort((a,b)=>a.day.localeCompare(b.day))};
}
