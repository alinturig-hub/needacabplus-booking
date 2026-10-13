import {database} from '@/lib/database';
import {taxiCrmLiveReadEnabled} from '@/lib/taxicrm-database';
import {taxiCrmClearDrivers} from '@/lib/taxicrm-live';
import {taxiCrmFleetMapVehicles,type FleetMapVehicle} from '@/lib/taxicrm-fleet-map';

const freshnessMinutes=()=>{const value=Number(process.env.DRIVER_LIVE_FRESHNESS_MINUTES||10);return Number.isFinite(value)&&value>0?Math.floor(value):10};

export async function clearDrivers(forceLocal=false){
 if(taxiCrmLiveReadEnabled()&&!forceLocal)return taxiCrmClearDrivers();
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

export async function fleetMapVehicles():Promise<FleetMapVehicle[]>{
 if(taxiCrmLiveReadEnabled())return taxiCrmFleetMapVehicles();
 const result=await database().query<{
  driver_id:string;vehicle_id:string|null;vehicle_callsign:string|null;registration:string|null;plate_number:string|null;
  latitude:number;longitude:number;vehicle_status:string|null;booking_id:string|null;recorded_at:Date|string;
  callsign:string|null;forename:string|null;surname:string|null
 }>(`SELECT DISTINCT ON (COALESCE(position.vehicle_id,position.driver_id))
  position.driver_id,position.vehicle_id,position.vehicle_callsign,COALESCE(position.registration,vehicle.registration) registration,
  COALESCE(position.plate_number,vehicle.plate_number) plate_number,position.latitude,position.longitude,position.vehicle_status,
  position.booking_id::text booking_id,position.recorded_at,driver.callsign,driver.forename,driver.surname
  FROM driver_positions position JOIN drivers driver ON driver.id=position.driver_id
  LEFT JOIN autocab_vehicles vehicle ON vehicle.external_id=position.vehicle_id
  WHERE position.recorded_at>=now()-interval '24 hours' AND position.recorded_at<=now()+interval '30 seconds'
   AND position.latitude BETWEEN -90 AND 90 AND position.longitude BETWEEN -180 AND 180
  ORDER BY COALESCE(position.vehicle_id,position.driver_id),position.recorded_at DESC,position.id DESC LIMIT 1000`);
 const now=Date.now();
 return result.rows.map(row=>{
  const recordedAt=new Date(row.recorded_at).toISOString();
  const status=row.vehicle_status||'Unknown';
  const operationalStatus:FleetMapVehicle['operationalStatus']=status==='Clear'?'CLEAR':status==='NotWorking'?'OFFLINE':status.startsWith('BusyMeterOn')?'POB':status.startsWith('BusyMeterOff')?'DOW':'UNKNOWN';
  const bookingId=row.booking_id===null?null:Number(row.booking_id);
  return {id:row.vehicle_id||row.driver_id,driverId:row.driver_id.startsWith('vehicle:')?null:row.driver_id,
   callsign:row.callsign||row.vehicle_callsign,name:[row.forename,row.surname].filter(Boolean).join(' ')||null,
   latitude:Number(row.latitude),longitude:Number(row.longitude),vehicleStatus:status,operationalStatus,
   recordedAt,isLive:now-new Date(recordedAt).getTime()<=120_000,
   registration:row.registration||row.plate_number||row.vehicle_callsign,
   bookingId:bookingId!==null&&Number.isSafeInteger(bookingId)&&bookingId>0?bookingId:null,
   pickupAddress:null,destinationAddress:null,todayRevenue:null};
 });
}

export async function publicClearVehicles(forceLocal=false){
 const drivers=await clearDrivers(forceLocal);
 // Keep operational callsigns in the admin feed only. Latest sample wins when
 // several driver records refer to the same vehicle.
 const vehicles=new Map<string,{id:string;latitude:number;longitude:number;recordedAt:string}>();
 for(const driver of drivers){const id=driver.vehicleId||driver.driverId;if(!vehicles.has(id))vehicles.set(id,{id,latitude:driver.latitude,longitude:driver.longitude,recordedAt:driver.recordedAt})}
 return [...vehicles.values()];
}
