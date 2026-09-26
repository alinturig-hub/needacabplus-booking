import {database} from '@/lib/database';

const freshnessMinutes=()=>{const value=Number(process.env.DRIVER_LIVE_FRESHNESS_MINUTES||10);return Number.isFinite(value)&&value>0?Math.floor(value):10};

export async function clearDrivers(){
 const result=await database().query(`WITH latest AS (
  SELECT DISTINCT ON (position.driver_id) position.driver_id,position.latitude,position.longitude,position.vehicle_status,position.recorded_at,driver.callsign,driver.forename,driver.surname
  FROM driver_positions position JOIN drivers driver ON driver.id=position.driver_id
  WHERE position.recorded_at>=now()-make_interval(mins=>$1) AND position.latitude IS NOT NULL AND position.longitude IS NOT NULL
  ORDER BY position.driver_id,position.recorded_at DESC,position.id DESC
 ) SELECT latest.driver_id,latest.callsign,latest.forename,latest.surname,latest.latitude,latest.longitude,latest.vehicle_status,latest.recorded_at,ad.mobile AS phone
 FROM latest LEFT JOIN autocab_drivers ad ON ad.external_id=latest.driver_id
 WHERE lower(trim(latest.vehicle_status))='clear' ORDER BY latest.recorded_at DESC`,[freshnessMinutes()]);
 return result.rows.map(row=>({driverId:row.driver_id,callsign:row.callsign as string|null,name:[row.forename,row.surname].filter(Boolean).join(' ')||null,phone:(row.phone as string|null)||null,latitude:row.latitude as number,longitude:row.longitude as number,vehicleStatus:row.vehicle_status as string,recordedAt:(row.recorded_at?.toISOString?.()??row.recorded_at) as string}));
}
