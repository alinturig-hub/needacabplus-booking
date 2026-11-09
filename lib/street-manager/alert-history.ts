import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {AlertHistoryPage} from './operations-types';
const cursorSchema=z.object({at:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export const historyStatusSchema=z.enum(['all','SENDING','ACCEPTED','REJECTED','UNKNOWN','SUPPRESSED']);
export function parseAlertHistoryCursor(value:string|null){
 if(!value)return null;
 if(value.length>300||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('INVALID_CURSOR');
 try{return cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')))}catch{throw Error('INVALID_CURSOR')}
}
type HistoryDbRow={id:string;driver_id:string;vehicle_id:string;driver_callsign:string|null;vehicle_callsign:string|null;message:string;status:string;outcome_code:string|null;http_status:number|null;distance_metres:number;created_at:Date|string;completed_at:Date|string|null};
export async function loadDriverAlertHistory(client:Pick<PoolClient,'query'>,options:{cursor?:string|null;status?:string}={}):Promise<AlertHistoryPage>{
 const cursor=parseAlertHistoryCursor(options.cursor??null),status=historyStatusSchema.parse(options.status??'all');
 const ready=(await client.query("SELECT to_regclass('public.street_manager_driver_alerts') IS NOT NULL AS ready")).rows[0].ready;
 if(!ready)return {rows:[],nextCursor:null};
 const result=await client.query<HistoryDbRow>(`SELECT a.id,a.driver_id,a.vehicle_id,d.callsign AS driver_callsign,v.callsign AS vehicle_callsign,a.message,a.status,a.outcome_code,a.http_status,a.distance_metres,a.created_at,a.completed_at
 FROM street_manager_driver_alerts a LEFT JOIN public."Driver" d ON d.provider='AUTOCAB' AND d."externalId"=a.driver_id
 LEFT JOIN public."Vehicle" v ON v.provider='AUTOCAB' AND v."externalId"=a.vehicle_id
 WHERE ($1::text='all' OR a.status=$1) AND ($2::timestamptz IS NULL OR (a.created_at,a.id)<($2::timestamptz,$3::text))
 ORDER BY a.created_at DESC,a.id DESC LIMIT 51`,[status,cursor?.at??null,cursor?.id??null]);
 const rows=result.rows.slice(0,50).map(row=>({id:row.id,driverId:row.driver_id,vehicleId:row.vehicle_id,driverCallsign:row.driver_callsign,vehicleCallsign:row.vehicle_callsign,message:row.message,status:row.status,outcomeCode:row.outcome_code,httpStatus:row.http_status,distanceMetres:row.distance_metres,createdAt:new Date(row.created_at).toISOString(),completedAt:row.completed_at?new Date(row.completed_at).toISOString():null}));
 const last=rows.at(-1);return {rows,nextCursor:result.rows.length>50&&last?Buffer.from(JSON.stringify({at:last.createdAt,id:last.id})).toString('base64url'):null};
}
