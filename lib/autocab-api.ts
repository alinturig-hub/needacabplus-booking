import {database} from '@/lib/database';
import {decryptCredentials} from '@/lib/credentials';

type JsonRecord=Record<string,unknown>;
type EndpointRow={base_url:string;auth_type:'none'|'api_key'|'bearer'|'basic';api_key_header:string;credentials_encrypted:string;method:string;path:string;request_example:unknown};

export class AutocabConfigurationError extends Error{}
export class AutocabApiError extends Error{}

function record(value:unknown):JsonRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{}}
function field(source:JsonRecord,...names:string[]){for(const name of names){const match=Object.entries(source).find(([key])=>key.toLowerCase()===name.toLowerCase());if(match&&match[1]!==null&&match[1]!==undefined&&match[1]!=='')return match[1]}return undefined}
function text(source:JsonRecord,...names:string[]){const value=field(source,...names);return value===undefined?null:String(value)}
function bool(source:JsonRecord,...names:string[]){const value=field(source,...names);if(typeof value==='boolean')return value;if(typeof value==='number')return value!==0;if(typeof value==='string')return ['true','1','yes','suspended','inactive'].includes(value.toLowerCase());return false}
function integer(source:JsonRecord,...names:string[]){const value=Number(field(source,...names));return Number.isFinite(value)?Math.trunc(value):null}
function array(source:JsonRecord,...names:string[]){const value=field(source,...names);return Array.isArray(value)?value:[]}

function listFrom(payload:unknown,keys:string[]):JsonRecord[]{
 if(Array.isArray(payload))return payload.map(record).filter(item=>Object.keys(item).length);
 const root=record(payload);
 for(const key of keys){const direct=field(root,key);if(Array.isArray(direct))return direct.map(record).filter(item=>Object.keys(item).length);const nested=record(direct);for(const inner of ['items','results','data','values']){const value=field(nested,inner);if(Array.isArray(value))return value.map(record).filter(item=>Object.keys(item).length)}}
 for(const container of ['data','result','response']){const nested=record(field(root,container));for(const key of [...keys,'items','results','values']){const value=field(nested,key);if(Array.isArray(value))return value.map(record).filter(item=>Object.keys(item).length)}}
 return [];
}

async function call(actionKey:string){
 const result=await database().query<EndpointRow>(`SELECT connection.base_url,connection.auth_type,connection.api_key_header,connection.credentials_encrypted,endpoint.method,endpoint.path,endpoint.request_example
  FROM api_endpoints endpoint JOIN api_connections connection ON connection.id=endpoint.connection_id
  WHERE connection.provider='autocab' AND endpoint.action_key=$1 AND endpoint.enabled=true LIMIT 1`,[actionKey]);
 const endpoint=result.rows[0];
 if(!endpoint)throw new AutocabConfigurationError(`Add an enabled Autocab endpoint with action key “${actionKey}” in Configuration → API.`);
 const url=new URL(endpoint.path,`${endpoint.base_url.replace(/\/$/,'')}/`);
 if(url.protocol!=='https:')throw new AutocabConfigurationError('The Autocab connection must use HTTPS.');
 const headers=new Headers({Accept:'application/json'}),credentials=decryptCredentials(endpoint.credentials_encrypted);
 if(endpoint.auth_type==='api_key')headers.set(endpoint.api_key_header,credentials.token||'');
 if(endpoint.auth_type==='bearer')headers.set('Authorization',`Bearer ${credentials.token||''}`);
 if(endpoint.auth_type==='basic')headers.set('Authorization',`Basic ${Buffer.from(`${credentials.username||''}:${credentials.password||''}`).toString('base64')}`);
 const method=endpoint.method.toUpperCase(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 const init:RequestInit={method,headers,signal:controller.signal,cache:'no-store'};
 if(method!=='GET'&&method!=='HEAD'){headers.set('Content-Type','application/json');init.body=JSON.stringify(endpoint.request_example||{})}
 try{
  const response=await fetch(url,init);
  if(!response.ok)throw new AutocabApiError(`Autocab returned HTTP ${response.status} for ${actionKey}. Check the endpoint path and API permissions.`);
  const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('json'))throw new AutocabApiError(`Autocab returned a non-JSON response for ${actionKey}.`);
  return await response.json() as unknown;
 }finally{clearTimeout(timer)}
}

export async function syncDrivers(){
 const payload=await call('drivers.list'),items=listFrom(payload,['drivers','driverList']);
 if(!items.length)throw new AutocabApiError('Autocab returned no driver records. Check that drivers.list points to the driver list endpoint.');
 const db=database();let saved=0;
 for(const item of items){
  const externalId=text(item,'id','driverId','driverID','driverCode','callsign','callSign');if(!externalId)continue;
  const firstName=text(item,'firstName','forename'),lastName=text(item,'lastName','surname');
  const displayName=text(item,'displayName','fullName','name')||[firstName,lastName].filter(Boolean).join(' ')||externalId;
  const suspended=bool(item,'suspended','isSuspended','disabled','isDisabled'),status=text(item,'status','driverStatus')||(suspended?'Suspended':'Active');
  await db.query(`INSERT INTO autocab_drivers (external_id,callsign,first_name,last_name,display_name,mobile,email,company,status,suspended,capabilities,raw_payload,synced_at,updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,now(),now())
   ON CONFLICT (external_id) DO UPDATE SET callsign=EXCLUDED.callsign,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,display_name=EXCLUDED.display_name,mobile=EXCLUDED.mobile,email=EXCLUDED.email,company=EXCLUDED.company,status=EXCLUDED.status,suspended=EXCLUDED.suspended,capabilities=EXCLUDED.capabilities,raw_payload=EXCLUDED.raw_payload,synced_at=now(),updated_at=now()`,[
    externalId,text(item,'callsign','callSign','driverCallsign'),firstName,lastName,displayName,text(item,'mobile','mobileNumber','telephoneNumber','phone'),text(item,'email','emailAddress'),text(item,'company','companyName'),status,suspended,JSON.stringify(array(item,'capabilities','driverCapabilities')),JSON.stringify(item)
   ]);saved++;
 }
 return {received:items.length,saved};
}

export async function syncVehicles(){
 const payload=await call('vehicles.list'),items=listFrom(payload,['vehicles','vehicleList','cars']);
 if(!items.length)throw new AutocabApiError('Autocab returned no vehicle records. Check that vehicles.list points to the vehicle list endpoint.');
 const db=database();let saved=0;
 for(const item of items){
  const externalId=text(item,'id','vehicleId','vehicleID','vehicleCode','callsign','callSign','registration','registrationNumber');if(!externalId)continue;
  const suspended=bool(item,'suspended','isSuspended','disabled','isDisabled'),status=text(item,'status','vehicleStatus')||(suspended?'Suspended':'Active');
  await db.query(`INSERT INTO autocab_vehicles (external_id,callsign,registration,make,model,colour,passenger_capacity,vehicle_type,plate_number,company,status,suspended,capabilities,raw_payload,synced_at,updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,now(),now())
   ON CONFLICT (external_id) DO UPDATE SET callsign=EXCLUDED.callsign,registration=EXCLUDED.registration,make=EXCLUDED.make,model=EXCLUDED.model,colour=EXCLUDED.colour,passenger_capacity=EXCLUDED.passenger_capacity,vehicle_type=EXCLUDED.vehicle_type,plate_number=EXCLUDED.plate_number,company=EXCLUDED.company,status=EXCLUDED.status,suspended=EXCLUDED.suspended,capabilities=EXCLUDED.capabilities,raw_payload=EXCLUDED.raw_payload,synced_at=now(),updated_at=now()`,[
    externalId,text(item,'callsign','callSign','vehicleCallsign'),text(item,'registration','registrationNumber','reg'),text(item,'make','manufacturer'),text(item,'model'),text(item,'colour','color'),integer(item,'passengerCapacity','passengers','passengerSize','seats'),text(item,'vehicleType','type'),text(item,'plateNumber','plate'),text(item,'company','companyName'),status,suspended,JSON.stringify(array(item,'capabilities','vehicleCapabilities')),JSON.stringify(item)
   ]);saved++;
 }
 return {received:items.length,saved};
}
