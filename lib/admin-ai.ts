import {z} from 'zod';
import {database} from './database';
import {decryptCredentials} from './credentials';

export const aiModels=['gpt-4.1-mini','gpt-4.1','gpt-4o-mini'] as const;
export type AiModel=(typeof aiModels)[number];

type AiSettingsRow={enabled:boolean;model:string;api_key_encrypted:string};
export async function aiSettings(){
 const result=await database().query<AiSettingsRow>('SELECT enabled,model,api_key_encrypted FROM admin_ai_settings WHERE id=true');
 const row=result.rows[0];
 const storedKey=row?.api_key_encrypted?decryptCredentials(row.api_key_encrypted).apiKey:'';
 return {enabled:row?.enabled??false,model:aiModels.includes(row?.model as AiModel)?row!.model as AiModel:aiModels[0],apiKey:storedKey||process.env.OPENAI_API_KEY||'',keyConfigured:Boolean(storedKey||process.env.OPENAI_API_KEY),keySource:storedKey?'admin':process.env.OPENAI_API_KEY?'environment':'none'};
}

const termSchema=z.object({query:z.string().trim().min(2).max(80)}).strict();
const emptySchema=z.object({}).strict();

export const aiTools=[
 {type:'function',function:{name:'search_bookings',description:'Find bookings by booking ID, external reference, passenger name, pickup, destination or status. Returns at most 10 recent records.',parameters:{type:'object',properties:{query:{type:'string',description:'Search term, at least 2 characters.'}},required:['query'],additionalProperties:false}}},
 {type:'function',function:{name:'search_drivers',description:'Find local and synchronized Autocab drivers by name or callsign. Returns at most 10 records per source.',parameters:{type:'object',properties:{query:{type:'string',description:'Name or callsign, at least 2 characters.'}},required:['query'],additionalProperties:false}}},
 {type:'function',function:{name:'search_vehicles',description:'Find local and synchronized Autocab vehicles by registration, plate, make, model or type. Returns at most 10 records per source.',parameters:{type:'object',properties:{query:{type:'string',description:'Plate, model or type, at least 2 characters.'}},required:['query'],additionalProperties:false}}},
 {type:'function',function:{name:'fleet_overview',description:'Get counts of local and Autocab drivers by status and counts of local and Autocab vehicles.',parameters:{type:'object',properties:{},additionalProperties:false}}},
] as const;

export async function runAiTool(name:string,argumentsJson:string){
 let args:unknown;
 try{args=JSON.parse(argumentsJson)}catch{return {error:'Invalid tool arguments.'}}
 const db=database();
 if(name==='search_bookings'){
  const parsed=termSchema.safeParse(args);if(!parsed.success)return {error:'Enter a search term of 2–80 characters.'};
  const pattern=`%${parsed.data.query.replace(/[\\%_]/g,'\\$&')}%`;
  const result=await db.query(`SELECT id,external_booking_id,name,pickup,destination,status,vehicle,fare_pence,created_at FROM bookings WHERE id::text ILIKE $1 ESCAPE '\\' OR COALESCE(external_booking_id,'') ILIKE $1 ESCAPE '\\' OR name ILIKE $1 ESCAPE '\\' OR pickup ILIKE $1 ESCAPE '\\' OR destination ILIKE $1 ESCAPE '\\' OR status ILIKE $1 ESCAPE '\\' ORDER BY created_at DESC LIMIT 10`,[pattern]);
  return {records:result.rows,open:'/admin/bookings',note:'Only the 10 most recent matches are shown.'};
 }
 if(name==='search_drivers'){
  const parsed=termSchema.safeParse(args);if(!parsed.success)return {error:'Enter a search term of 2–80 characters.'};
  const pattern=`%${parsed.data.query.replace(/[\\%_]/g,'\\$&')}%`;
  const [local,autocab]=await Promise.all([
   db.query(`SELECT id,callsign,first_name,last_name,status,updated_at FROM local_drivers WHERE callsign ILIKE $1 ESCAPE '\\' OR first_name ILIKE $1 ESCAPE '\\' OR last_name ILIKE $1 ESCAPE '\\' ORDER BY updated_at DESC LIMIT 10`,[pattern]),
   db.query(`SELECT external_id,callsign,display_name,status,suspended,synced_at FROM autocab_drivers WHERE callsign ILIKE $1 ESCAPE '\\' OR display_name ILIKE $1 ESCAPE '\\' ORDER BY synced_at DESC LIMIT 10`,[pattern]),
  ]);
  return {local:local.rows,autocab:autocab.rows,open:'/admin/drivers',note:'Up to 10 matches per source.'};
 }
 if(name==='search_vehicles'){
  const parsed=termSchema.safeParse(args);if(!parsed.success)return {error:'Enter a search term of 2–80 characters.'};
  const pattern=`%${parsed.data.query.replace(/[\\%_]/g,'\\$&')}%`;
  const [local,autocab]=await Promise.all([
   db.query(`SELECT v.id,v.plate,v.make,v.model,v.color,v.status,t.name AS car_type FROM local_vehicles v JOIN local_car_types t ON t.id=v.car_type_id WHERE v.plate ILIKE $1 ESCAPE '\\' OR v.make ILIKE $1 ESCAPE '\\' OR v.model ILIKE $1 ESCAPE '\\' OR t.name ILIKE $1 ESCAPE '\\' ORDER BY v.updated_at DESC LIMIT 10`,[pattern]),
   db.query(`SELECT external_id,registration,plate_number,make,model,vehicle_type,status,suspended FROM autocab_vehicles WHERE registration ILIKE $1 ESCAPE '\\' OR plate_number ILIKE $1 ESCAPE '\\' OR make ILIKE $1 ESCAPE '\\' OR model ILIKE $1 ESCAPE '\\' OR vehicle_type ILIKE $1 ESCAPE '\\' ORDER BY synced_at DESC LIMIT 10`,[pattern]),
  ]);
  return {local:local.rows,autocab:autocab.rows,open:'/admin/vehicles',note:'Up to 10 matches per source.'};
 }
 if(name==='fleet_overview'){
  if(!emptySchema.safeParse(args).success)return {error:'Invalid tool arguments.'};
  const [localDrivers,autocabDrivers,localVehicles,autocabVehicles]=await Promise.all([
   db.query('SELECT status,COUNT(*)::int AS count FROM local_drivers GROUP BY status'),
   db.query('SELECT status,suspended,COUNT(*)::int AS count FROM autocab_drivers GROUP BY status,suspended'),
   db.query('SELECT status,COUNT(*)::int AS count FROM local_vehicles GROUP BY status'),
   db.query('SELECT status,suspended,COUNT(*)::int AS count FROM autocab_vehicles GROUP BY status,suspended'),
  ]);
  return {localDrivers:localDrivers.rows,autocabDrivers:autocabDrivers.rows,localVehicles:localVehicles.rows,autocabVehicles:autocabVehicles.rows,driversPage:'/admin/drivers',vehiclesPage:'/admin/vehicles'};
 }
 return {error:'Unknown tool.'};
}
