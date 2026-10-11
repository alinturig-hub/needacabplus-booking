import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';

const freshnessMinutes=()=>{const value=Number(process.env.DRIVER_LIVE_FRESHNESS_MINUTES||10);return Number.isFinite(value)&&value>0?Math.floor(value):10};

export async function taxiCrmClearDrivers(){
 const minutes=freshnessMinutes();
 return withTaxiCrmReadOnly(async client=>{
  const result=await client.query<{
   driver_id:string|null;vehicle_id:string;vehicle_callsign:string|null;registration:string|null;plate_number:string|null;callsign:string|null;forename:string|null;surname:string|null;latitude:string|number;longitude:string|number;vehicle_status:string;recorded_at:Date|string;phone:string|null
  }>(`SELECT driver."externalId" driver_id,vehicle."externalId" vehicle_id,vehicle.callsign vehicle_callsign,vehicle.registration,vehicle."plateNumber" plate_number,
   driver.callsign,driver.forename,driver.surname,vehicle."currentLatitude" latitude,vehicle."currentLongitude" longitude,
   vehicle."currentStatus" vehicle_status,vehicle."lastSeenAt" recorded_at,driver.mobile phone
   FROM public."Vehicle" vehicle LEFT JOIN public."Driver" driver ON driver.id=vehicle."currentDriverId"
   WHERE vehicle."lastSeenAt">=now()-make_interval(mins=>$1) AND vehicle."currentLatitude" IS NOT NULL AND vehicle."currentLongitude" IS NOT NULL
    AND lower(trim(vehicle."currentStatus"))='clear' AND vehicle."isActive" IS DISTINCT FROM false AND vehicle."isSuspended" IS DISTINCT FROM true
   ORDER BY vehicle."lastSeenAt" DESC LIMIT 1000`,[minutes]);
  return result.rows.map(row=>({driverId:row.driver_id||row.vehicle_id,vehicleId:row.vehicle_id,vehicleCallsign:row.vehicle_callsign,registration:row.registration,plateNumber:row.plate_number,callsign:row.callsign,name:[row.forename,row.surname].filter(Boolean).join(' ')||null,phone:row.phone,latitude:Number(row.latitude),longitude:Number(row.longitude),vehicleStatus:row.vehicle_status,recordedAt:new Date(row.recorded_at).toISOString()}));
 });
}

export async function taxiCrmFleetFreshness(){
 return withTaxiCrmReadOnly(async client=>{
  const result=await client.query<{clear:number;last_track:Date|string|null}>(`SELECT count(*) FILTER(WHERE lower(trim("currentStatus"))='clear' AND "lastSeenAt">=now()-interval '2 minutes')::int clear,
   max("lastSeenAt") FILTER(WHERE "lastSeenAt"<=now()+interval '30 seconds') last_track FROM public."Vehicle"`);
  return {clear:Number(result.rows[0]?.clear||0),last_track:result.rows[0]?.last_track?new Date(result.rows[0].last_track).toISOString():null};
 });
}
