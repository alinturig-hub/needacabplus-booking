import type {Pool} from 'pg';

type JsonObject=Record<string,unknown>;
type DriverInput={id:string;callsign?:string;forename?:string;surname?:string;badge_number?:string;licence_number?:string;active?:boolean};
type PositionInput=DriverInput&{vehicle_id?:string;vehicle_callsign?:string;registration?:string;plate_number?:string;latitude:number;longitude:number;vehicle_status?:string;booking_id?:number;recorded_at:string};
type ShiftInput=DriverInput&{started_at?:string;ended_at?:string;updated_at?:string};
const object=(value:unknown):JsonObject|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:undefined;
const key=(value:JsonObject,name:string)=>Object.entries(value).find(([candidate])=>candidate.toLowerCase()===name.toLowerCase())?.[1];
const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value).trim()||undefined:undefined;
const finite=(value:unknown)=>{const parsed=typeof value==='number'?value:Number(value);return Number.isFinite(parsed)?parsed:undefined};
const dateText=(value:unknown)=>{const raw=text(value);if(!raw)return undefined;const time=Date.parse(raw);return Number.isFinite(time)?new Date(time).toISOString():undefined};
const eventKey=(value:string)=>value.toLowerCase().replace(/[^a-z]/g,'');
const driverFrom=(value:unknown,active?:boolean):DriverInput|undefined=>{const driver=object(value);if(!driver)return undefined;const id=text(key(driver,'id'));if(!id)return undefined;return {id,callsign:text(key(driver,'callsign')),forename:text(key(driver,'forename')),surname:text(key(driver,'surname')),badge_number:text(key(driver,'badgeNumber')),licence_number:text(key(driver,'licenceNumber')),active}};
const vehicleFrom=(value:unknown)=>{const vehicle=object(value)||{};return {vehicle_id:text(key(vehicle,'id')),vehicle_callsign:text(key(vehicle,'callsign')),registration:text(key(vehicle,'registration')),plate_number:text(key(vehicle,'plateNumber'))}};
async function upsertDrivers(db:Pool,drivers:DriverInput[]){
 const unique=[...new Map(drivers.filter(item=>item.id).map(item=>[item.id,item])).values()];
 if(!unique.length)return;
 await db.query(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text,callsign text,forename text,surname text,badge_number text,licence_number text,active boolean))
  INSERT INTO drivers (id,callsign,forename,surname,badge_number,licence_number,active,first_seen,last_seen)
  SELECT id,NULLIF(callsign,''),NULLIF(forename,''),NULLIF(surname,''),NULLIF(badge_number,''),NULLIF(licence_number,''),COALESCE(active,true),now(),now() FROM input WHERE id IS NOT NULL AND id<>''
  ON CONFLICT (id) DO UPDATE SET callsign=COALESCE(EXCLUDED.callsign,drivers.callsign),forename=COALESCE(EXCLUDED.forename,drivers.forename),surname=COALESCE(EXCLUDED.surname,drivers.surname),badge_number=COALESCE(EXCLUDED.badge_number,drivers.badge_number),licence_number=COALESCE(EXCLUDED.licence_number,drivers.licence_number),active=EXCLUDED.active,last_seen=now()`,[JSON.stringify(unique)]);
}
export function handlesDriverEvent(eventType:string){const normalized=eventKey(eventType);return normalized==='vehicletrackschanged'||normalized==='drivershiftstarted'||normalized==='drivershiftended'}
export async function saveDriverEvent(db:Pool,payload:unknown,eventType:string){
 const normalized=eventKey(eventType);const root=object(payload);if(!root)return {saved:false,reason:'Payload is not an object'};
 if(normalized==='vehicletrackschanged')return saveVehicleTracks(db,root);
 if(normalized==='drivershiftstarted'||normalized==='drivershiftended')return saveDriverShift(db,root,normalized==='drivershiftstarted');
 return {saved:false,reason:'Unsupported driver event'};
}
async function saveVehicleTracks(db:Pool,root:JsonObject){
 const tracksRaw=key(root,'vehicleTracks');if(!Array.isArray(tracksRaw))return {saved:false,reason:'VehicleTracks is not an array'};
 const positions:PositionInput[]=[];
 for(const track of tracksRaw){const item=object(track);if(!item)continue;const driver=driverFrom(key(item,'driver'));const location=object(key(item,'currentLocation'));const latitude=finite(location&&key(location,'latitude')),longitude=finite(location&&key(location,'longitude'));const recorded_at=dateText(key(item,'timestamp'));if(!driver||latitude===undefined||longitude===undefined||!recorded_at)continue;positions.push({...driver,...vehicleFrom(key(item,'vehicle')),latitude,longitude,vehicle_status:text(key(item,'vehicleStatus')),booking_id:finite(key(item,'bookingId')),recorded_at});}
 await upsertDrivers(db,positions);
 if(positions.length)await db.query(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(driver_id text,vehicle_id text,vehicle_callsign text,registration text,plate_number text,latitude double precision,longitude double precision,vehicle_status text,booking_id bigint,recorded_at timestamptz))
  INSERT INTO driver_positions (driver_id,vehicle_id,vehicle_callsign,registration,plate_number,latitude,longitude,vehicle_status,booking_id,recorded_at)
  SELECT driver_id,NULLIF(vehicle_id,''),NULLIF(vehicle_callsign,''),NULLIF(registration,''),NULLIF(plate_number,''),latitude,longitude,NULLIF(vehicle_status,''),booking_id,recorded_at FROM input WHERE driver_id IS NOT NULL AND driver_id<>'' AND latitude IS NOT NULL AND longitude IS NOT NULL AND recorded_at IS NOT NULL
  ON CONFLICT DO NOTHING`,[JSON.stringify(positions.map(({id,...position})=>({driver_id:id,...position})))]);
 return {saved:true,tracks:tracksRaw.length,positions:positions.length};
}
async function saveDriverShift(db:Pool,root:JsonObject,started:boolean){
 const driver=driverFrom(key(root,'driver'),started);if(!driver)return {saved:false,reason:'Driver ID missing'};
 await upsertDrivers(db,[driver]);
 const shift:ShiftInput={...driver,started_at:dateText(key(root,'startedDate')),ended_at:dateText(key(root,'endedDate')),updated_at:dateText(key(root,'modifiedDate'))||new Date().toISOString()};
 await db.query(`WITH input AS (SELECT * FROM jsonb_to_record($1::jsonb) AS x(driver_id text,started_at timestamptz,ended_at timestamptz,updated_at timestamptz))
  INSERT INTO driver_shifts (driver_id,started_at,ended_at,updated_at) SELECT driver_id,started_at,ended_at,COALESCE(updated_at,now()) FROM input WHERE driver_id IS NOT NULL AND driver_id<>''
  ON CONFLICT (driver_id) DO UPDATE SET started_at=COALESCE(EXCLUDED.started_at,driver_shifts.started_at),ended_at=EXCLUDED.ended_at,updated_at=COALESCE(EXCLUDED.updated_at,now())`,[JSON.stringify({driver_id:shift.id,started_at:shift.started_at,ended_at:shift.ended_at,updated_at:shift.updated_at})]);
 return {saved:true,shift:started?'started':'ended',driverId:driver.id};
}
