const field=(object,name)=>Object.entries(object||{}).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1];
const id=object=>field(object,'id')??field(object,'driverId')??field(object,'vehicleId');
const caps=value=>Array.isArray(value)?[...new Set(value.map(x=>String(typeof x==='object'?field(x,'id'):x)))].sort():null;
export function compareBooking(local,remote){
 const differences=[],unverified=[];
 const check=(name,a,b)=>{if(a===undefined||a===null||b===undefined||b===null){unverified.push(name);return}if(JSON.stringify(a)!==JSON.stringify(b))differences.push(name)};
 const reason=remote?.archivedBooking?.reason?.toLowerCase().replace(/[^a-z]/g,'');
 const status=({completed:'Completed',cancelled:'Cancelled',nofare:'No Fare'})[reason];
 check('terminalStatus',local.status,status);
 check('pickupTime',local.timeline_data?.scheduledAt?Date.parse(local.timeline_data.scheduledAt):null,remote.pickupDueTime?Date.parse(remote.pickupDueTime):null);
 check('driver',id(local.driver_data)?.toString(),id(remote.driver)?.toString());
 check('vehicle',id(local.vehicle_data)?.toString(),id(remote.vehicle)?.toString());
 check('price',local.fare_pence,typeof remote.pricing?.price==='number'?Math.round(remote.pricing.price*100):null);
 check('passengers',local.passengers==null?null:Number(local.passengers),remote.passengers==null?null:Number(remote.passengers));
 check('capabilities',caps(local.dispatch_requirements?.capabilities),caps(remote.capabilities));
 for(const name of ['pickup','destination']){
  const coord=remote[name]?.address?.coordinate;
  for(const axis of ['latitude','longitude'])check(`${name}.${axis}`,local[`${name}_data`]?.[axis]==null?null:Number(local[`${name}_data`][axis]).toFixed(5),coord?.[axis]==null?null:Number(coord[axis]).toFixed(5));
 }
 check('viaCount',Array.isArray(local.vias_data)?local.vias_data.length:null,Array.isArray(remote.vias)?remote.vias.length:null);
 return {differences,unverified};
}
