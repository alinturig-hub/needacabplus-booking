export function dispatchObservation(eventType:string,payload:unknown){
 const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const get=(value:Record<string,unknown>,name:string)=>Object.entries(value).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1];
 const root=record(payload),data=record(get(root,'data')),detail=record(get(root,'booking')??get(root,'metadata')??get(data,'booking')??get(data,'metadata')??get(root,'data')??root);
 const records=[detail,data,root];
 const actor=(type:string)=>{
  for(const item of records){
   const nested=record(get(record(get(item,`${type}Details`)),type));
   const explicit=get(item,`${type}Id`)??get(nested,'id')??get(record(get(item,type)),'id');
   if(explicit!==undefined&&explicit!==null)return explicit;
  }
  // A rejection may describe a previous offer: never borrow its current assignment.
  if(/reject/i.test(eventType))return undefined;
  for(const item of records){const value=get(record(get(item,'dispatchedBooking')),`${type}Id`);if(value!==undefined&&value!==null)return value}
 };
 const id=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,100):typeof value==='number'&&Number.isSafeInteger(value)?String(value):null;
 // Explicit identifiers only: never treat a nested generic id as a booking id.
 return {eventType,bookingId:id(get(detail,'bookingId')??get(root,'bookingId')),vehicleId:id(actor('vehicle')),driverId:id(actor('driver'))};
}
