import type {PoolClient} from 'pg';
export type TrafficPilot={configured:boolean;driverId:string|null;callsign:string|null};
export function trafficPilot(env:Record<string,string|undefined>=process.env):TrafficPilot|null{
 if(env.ROAD_CLOSURE_ALERTS_MODE!=='pilot')return null;
 const driverId=env.ROAD_CLOSURE_PILOT_DRIVER_ID?.trim()??'',callsign=env.ROAD_CLOSURE_PILOT_CALLSIGN?.trim().toUpperCase()??'';
 const configured=/^[1-9]\d*$/.test(driverId)&&Number.isSafeInteger(Number(driverId))&&/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(callsign);
 return {configured,driverId:configured?driverId:null,callsign:configured?callsign:null};
}
export function pilotCandidates<T extends {driverId:string}>(candidates:T[],pilot:TrafficPilot|null){return pilot?candidates.filter(c=>pilot.configured&&c.driverId===pilot.driverId):candidates}
export async function trafficRecipientAllowed(client:Pick<PoolClient,'query'>,vehicleId:string,driverId?:string){
 const mode=process.env.ROAD_CLOSURE_ALERTS_MODE;
 if(mode==='live')return true;
 const pilot=trafficPilot();
 if(mode!=='pilot'||!pilot?.configured||!driverId||driverId!==pilot.driverId)return false;
 const row=(await client.query(`SELECT EXISTS(SELECT 1 FROM "Vehicle" v JOIN "Driver" d ON d.id=v."currentDriverId"
 WHERE v.provider='AUTOCAB' AND d.provider='AUTOCAB' AND v."externalId"=$1 AND d."externalId"=$2 AND upper(btrim(d.callsign))=$3
 AND d.active AND NOT d.suspended AND NOT d.archived AND v."isActive" AND NOT v."isSuspended"
 AND v."lastSeenAt" BETWEEN now()-interval '90 seconds' AND now()+interval '5 seconds'
 AND EXISTS(SELECT 1 FROM "DriverShift" s WHERE s.provider='AUTOCAB' AND s."driverId"=d.id AND s."vehicleId"=v.id AND s.status='ACTIVE' AND s."endedAt" IS NULL)) AS allowed`,[vehicleId,pilot.driverId,pilot.callsign])).rows[0];
 return row?.allowed===true;
}
