export function dispatchObservation(eventType:string,payload:unknown){
 const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const root=record(payload),data=record(root.data),detail=record(root.booking??root.metadata??data.booking??data.metadata??root.data??root);
 const id=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,100):typeof value==='number'&&Number.isSafeInteger(value)?String(value):null;
 // Explicit identifiers only: never treat a nested generic id as a booking id.
 return {eventType,bookingId:id(detail.bookingId??detail.bookingID??root.bookingId??root.bookingID),vehicleId:id(detail.vehicleId??record(detail.vehicle).id??root.vehicleId),driverId:id(detail.driverId??record(detail.driver).id??root.driverId)};
}
