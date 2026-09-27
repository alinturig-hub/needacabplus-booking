export function dispatchObservation(eventType:string,payload:unknown){
 const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const get=(value:Record<string,unknown>,name:string)=>Object.entries(value).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1];
 const root=record(payload),data=record(get(root,'data')),detail=record(get(root,'booking')??get(root,'metadata')??get(data,'booking')??get(data,'metadata')??get(root,'data')??root);
 const id=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,100):typeof value==='number'&&Number.isSafeInteger(value)?String(value):null;
 // Explicit identifiers only: never treat a nested generic id as a booking id.
 return {eventType,bookingId:id(get(detail,'bookingId')??get(root,'bookingId')),vehicleId:id(get(detail,'vehicleId')??get(record(get(detail,'vehicle')),'id')??get(root,'vehicleId')),driverId:id(get(detail,'driverId')??get(record(get(detail,'driver')),'id')??get(root,'driverId'))};
}
