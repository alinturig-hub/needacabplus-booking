import {database} from '@/lib/database';

const freshnessMinutes=()=>{const value=Number(process.env.DRIVER_LIVE_FRESHNESS_MINUTES||10);return Number.isFinite(value)&&value>0?Math.floor(value):10};

export async function clearDrivers(){
 const result=await database().query(`WITH latest AS (
  SELECT DISTINCT ON (position.driver_id) position.driver_id,position.vehicle_id,position.vehicle_callsign,position.registration,position.plate_number,position.latitude,position.longitude,position.vehicle_status,position.recorded_at,driver.callsign,driver.forename,driver.surname
  FROM driver_positions position JOIN drivers driver ON driver.id=position.driver_id
  WHERE position.recorded_at>=now()-make_interval(mins=>$1) AND position.latitude IS NOT NULL AND position.longitude IS NOT NULL
  ORDER BY position.driver_id,position.recorded_at DESC,position.id DESC
 ) SELECT latest.driver_id,latest.vehicle_id,latest.vehicle_callsign,latest.registration,latest.plate_number,latest.callsign,latest.forename,latest.surname,latest.latitude,latest.longitude,latest.vehicle_status,latest.recorded_at,ad.mobile AS phone
 FROM latest LEFT JOIN autocab_drivers ad ON ad.external_id=latest.driver_id
 WHERE lower(trim(latest.vehicle_status))='clear' ORDER BY latest.recorded_at DESC`,[freshnessMinutes()]);
 return result.rows.map(row=>({driverId:row.driver_id,vehicleId:(row.vehicle_id as string|null)||null,vehicleCallsign:(row.vehicle_callsign as string|null)||null,registration:(row.registration as string|null)||null,plateNumber:(row.plate_number as string|null)||null,callsign:row.callsign as string|null,name:[row.forename,row.surname].filter(Boolean).join(' ')||null,phone:(row.phone as string|null)||null,latitude:row.latitude as number,longitude:row.longitude as number,vehicleStatus:row.vehicle_status as string,recordedAt:(row.recorded_at?.toISOString?.()??row.recorded_at) as string}));
}

export async function publicClearVehicles(){
 const drivers=await clearDrivers();
 // Keep operational callsigns in the admin feed only. Latest sample wins when
 // several driver records refer to the same vehicle.
 const vehicles=new Map<string,{id:string;latitude:number;longitude:number;recordedAt:string}>();
 for(const driver of drivers){const id=driver.vehicleId||driver.driverId;if(!vehicles.has(id))vehicles.set(id,{id,latitude:driver.latitude,longitude:driver.longitude,recordedAt:driver.recordedAt})}
 return [...vehicles.values()];
}
