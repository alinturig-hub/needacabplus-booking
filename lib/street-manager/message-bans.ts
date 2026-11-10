import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
export type TrafficBan={id:string;callsign:string;driver_id:string;driver_name:string;vehicle_id:string;vehicle_callsign:string|null;registration:string|null;association_source:string;association_at:string|null;version:number;created_at:string;updated_at:string};
export class BanListError extends Error{constructor(public code:string,message:string,public status=400){super(message)}}
type Client=Pick<PoolClient,'query'>;
export const trafficBanLock="SELECT pg_advisory_xact_lock(hashtext('nac:traffic-message-ban-list'))";
export function parseBanCallsigns(value:string){
 const values=[...new Set(value.split(/[,;\s]+/).filter(Boolean).map(s=>s.trim().toUpperCase()))];
 if(!values.length||values.length>100||values.some(s=>!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(s)))throw new BanListError('INVALID_CALLSIGNS','Enter 1–100 driver callsigns, separated by commas or new lines.');
 return values;
}
export async function listTrafficBans(client:Client):Promise<TrafficBan[]>{
 return (await client.query(`SELECT id,callsign,driver_id,driver_name,vehicle_id,vehicle_callsign,registration,association_source,association_at,version,created_at,updated_at FROM street_manager_message_bans WHERE active ORDER BY callsign,id`)).rows.map(row=>({...row,association_at:row.association_at?new Date(row.association_at).toISOString():null,created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString()}));
}
async function resolveBan(client:Client,callsign:string){
 const drivers=(await client.query(`SELECT id,"externalId",coalesce("fullName",concat_ws(' ',forename,surname),callsign) AS name FROM "Driver" WHERE provider='AUTOCAB' AND upper(btrim(callsign))=$1 AND active AND NOT suspended AND NOT archived`,[callsign])).rows;
 if(drivers.length!==1)throw new BanListError('DRIVER_NOT_UNIQUE',drivers.length?`Callsign ${callsign} matches multiple active drivers. Resolve the registry conflict first.`:`No active driver found for callsign ${callsign}.`);
 const driver=drivers[0];
 const fields='v."externalId" AS vehicle_id,v.callsign AS vehicle_callsign,v.registration';
 let rows=(await client.query(`SELECT ${fields},v."lastSeenAt" AS association_at FROM "Vehicle" v WHERE v.provider='AUTOCAB' AND v."currentDriverId"=$1`,[driver.id])).rows,source='current_vehicle';
 if(!rows.length){rows=(await client.query(`SELECT ${fields},s."startedAt" AS association_at FROM "DriverShift" s JOIN "Vehicle" v ON v.id=s."vehicleId" WHERE s.provider='AUTOCAB' AND s."driverId"=$1 AND s.status='ACTIVE' AND s."endedAt" IS NULL`,[driver.id])).rows;source='active_shift';}
 if(!rows.length){rows=(await client.query(`SELECT ${fields},s."startedAt" AS association_at FROM "DriverShift" s JOIN "Vehicle" v ON v.id=s."vehicleId" WHERE s.provider='AUTOCAB' AND s."driverId"=$1 AND s."startedAt"=(SELECT max(x."startedAt") FROM "DriverShift" x WHERE x.provider='AUTOCAB' AND x."driverId"=$1 AND x."vehicleId" IS NOT NULL)`,[driver.id])).rows;source='latest_shift';}
 const ids=new Set(rows.map(r=>r.vehicle_id));
 if(ids.size!==1)throw new BanListError('VEHICLE_NOT_UNIQUE',ids.size?`Multiple associated vehicles found for callsign ${callsign}. No changes saved.`:`No associated vehicle found for callsign ${callsign}. No changes saved.`);
 return {callsign,driver_id:driver.externalId,driver_name:driver.name,vehicle_id:rows[0].vehicle_id,vehicle_callsign:rows[0].vehicle_callsign,registration:rows[0].registration,association_source:source,association_at:rows[0].association_at};
}
export type BanMutation={action:'add';callsigns:string}|{action:'edit';id:string;version:number;callsign:string}|{action:'remove';id:string;version:number};
export async function mutateTrafficBans(client:Client,input:BanMutation){
 try{
  await client.query('BEGIN');await client.query(trafficBanLock);
  const existing=(await client.query('SELECT * FROM street_manager_message_bans WHERE active')).rows;
  if(input.action==='add'){
   const callsigns=parseBanCallsigns(input.callsigns);
   if(existing.length+callsigns.length>500)throw new BanListError('LIST_LIMIT','The ban list supports up to 500 entries.');
   for(const callsign of callsigns){
    if(existing.some(e=>e.callsign===callsign))throw new BanListError('ALREADY_BLOCKED',`Callsign ${callsign} is already on the ban list.`,409);
    const resolved=await resolveBan(client,callsign),id=randomUUID();
    const after=(await client.query(`INSERT INTO street_manager_message_bans(id,callsign,driver_id,driver_name,vehicle_id,vehicle_callsign,registration,association_source,association_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,resolved.callsign,resolved.driver_id,resolved.driver_name,resolved.vehicle_id,resolved.vehicle_callsign,resolved.registration,resolved.association_source,resolved.association_at])).rows[0];
    await client.query(`INSERT INTO street_manager_message_ban_audit(id,entry_id,action,after_data) VALUES($1,$2,'add',$3)`,[randomUUID(),id,JSON.stringify(after)]);
   }
  }else{
   const before=existing.find(e=>e.id===input.id);
   if(!before||before.version!==input.version)throw new BanListError('ENTRY_CHANGED','This entry changed or was removed. Refresh the list and try again.',409);
   let after;
   if(input.action==='remove')after=(await client.query('UPDATE street_manager_message_bans SET active=false,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[input.id])).rows[0];
   else{
    const callsigns=parseBanCallsigns(input.callsign);if(callsigns.length!==1)throw new BanListError('ONE_CALLSIGN','Enter one driver callsign when editing an entry.');
    const callsign=callsigns[0];if(existing.some(e=>e.callsign===callsign&&e.id!==input.id))throw new BanListError('ALREADY_BLOCKED',`Callsign ${callsign} is already on the ban list.`,409);
    const resolved=await resolveBan(client,callsign);
    after=(await client.query(`UPDATE street_manager_message_bans SET callsign=$2,driver_id=$3,driver_name=$4,vehicle_id=$5,vehicle_callsign=$6,registration=$7,association_source=$8,association_at=$9,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[input.id,resolved.callsign,resolved.driver_id,resolved.driver_name,resolved.vehicle_id,resolved.vehicle_callsign,resolved.registration,resolved.association_source,resolved.association_at])).rows[0];
   }
   await client.query(`INSERT INTO street_manager_message_ban_audit(id,entry_id,action,before_data,after_data) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),input.id,input.action,JSON.stringify(before),JSON.stringify(after)]);
  }
  const entries=await listTrafficBans(client);await client.query('COMMIT');return entries;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
export async function trafficMessageBlocked(client:Client,vehicleId:string,driverId?:string){
 const row=(await client.query(`SELECT EXISTS(SELECT 1 FROM street_manager_message_bans b WHERE b.active AND (b.vehicle_id=$1 OR b.driver_id=$2 OR EXISTS(SELECT 1 FROM "Vehicle" v JOIN "Driver" d ON d.id=v."currentDriverId" WHERE v.provider='AUTOCAB' AND v."externalId"=$1 AND (d."externalId"=b.driver_id OR upper(btrim(d.callsign))=b.callsign)))) AS blocked`,[vehicleId,driverId??null])).rows[0];
 return row?.blocked!==false;
}
