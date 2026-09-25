import {database} from '@/lib/database';
import {isAdmin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const freshnessMinutes=()=>{const value=Number(process.env.DRIVER_LIVE_FRESHNESS_MINUTES||10);return Number.isFinite(value)&&value>0?Math.floor(value):10};
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403,headers:{'Cache-Control':'no-store'}});
 try{
  const db=database();const minutes=freshnessMinutes();
  const result=await db.query(`WITH latest AS (
   SELECT DISTINCT ON (position.driver_id) position.driver_id,position.latitude,position.longitude,position.vehicle_status,position.recorded_at,driver.callsign,driver.forename,driver.surname
   FROM driver_positions position JOIN drivers driver ON driver.id=position.driver_id
   WHERE position.recorded_at>=now()-make_interval(mins=>$1) AND position.latitude IS NOT NULL AND position.longitude IS NOT NULL
   ORDER BY position.driver_id,position.recorded_at DESC,position.id DESC
  ) SELECT driver_id,callsign,forename,surname,latitude,longitude,vehicle_status,recorded_at FROM latest WHERE lower(vehicle_status)='clear' ORDER BY recorded_at DESC`,[minutes]);
  return Response.json(result.rows.map(row=>({driverId:row.driver_id,callsign:row.callsign,name:[row.forename,row.surname].filter(Boolean).join(' ')||null,latitude:row.latitude,longitude:row.longitude,vehicleStatus:row.vehicle_status,recordedAt:row.recorded_at?.toISOString?.()??row.recorded_at})),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
