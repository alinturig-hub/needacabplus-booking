export function capabilityIds(value:unknown):string[]|null{
 if(!Array.isArray(value))return null;
 const result:string[]=[];
 for(const entry of value){const raw=entry&&typeof entry==='object'?(entry as Record<string,unknown>).id??(entry as Record<string,unknown>).capabilityId:entry;
  if((typeof raw!=='number'&&typeof raw!=='string')||!/^\d+$/.test(String(raw)))return null;
  result.push(String(Number(raw)));
 }
 return [...new Set(result)];
}
export function matchDispatchRequirements(required:unknown,car:{driver_id:string;vehicle_id:string;driver_capabilities:unknown;vehicle_capabilities:unknown;passenger_capacity:number|null},detail:Record<string,unknown>){
 const ids=capabilityIds(required);if(!ids)return {ok:false,reason:'Booking capability IDs were not supplied in a recognised format.'};
 const available=new Set([...(capabilityIds(car.driver_capabilities)||[]),...(capabilityIds(car.vehicle_capabilities)||[])]);
 const missing=ids.filter(id=>!available.has(id));if(missing.length)return {ok:false,reason:`Missing capability IDs: ${missing.join(', ')}`};
 const passengers=Number(detail.passengers);
 if(Number.isFinite(passengers)&&passengers>0&&(!car.passenger_capacity||car.passenger_capacity<passengers))return {ok:false,reason:'Passenger capacity is insufficient or unknown.'};
 for(const [field,type,id] of [['driverConstraints','Drivers',car.driver_id],['vehicleConstraints','Vehicles',car.vehicle_id]] as const){
  const constraints=detail[field] as Record<string,unknown>|undefined;
  if(!constraints)continue;
  for(const prefix of ['forbidden','requested']){
   const list=constraints[`${prefix}${type}`];if(list===undefined)continue;
   const values=capabilityIds(list);if(!values)return {ok:false,reason:'Driver or vehicle restrictions could not be read.'};
   if(prefix==='forbidden'&&values.includes(id))return {ok:false,reason:'Excluded by booking restrictions.'};
   if(prefix==='requested'&&values.length&&!values.includes(id))return {ok:false,reason:'A different driver or vehicle is requested.'};
  }
 }
 return {ok:true,reason:ids.length?`Matches capability IDs ${ids.join(', ')}`:'No special capabilities required.'};
}
