import {database} from '../database';
import {decryptWebhookSecret} from '../autocab/webhook-secret';
import {requireAutocabIntegration} from '../integration-control';
import type {PoolClient} from 'pg';
import {trafficBanLock,trafficMessageBlocked} from './message-bans';
import {boundedText} from './sns';
export const driverMessageAction='vehicle.send-message';
export const vehicleMessageEndpoint='https://autocab-api.azure-api.net/vehicle/v1/vehicles/message';
export type VehicleMessageConnection={url:string;apiKey:string};
export type VehicleMessageResult={status:'ACCEPTED'|'REJECTED'|'UNKNOWN'|'SUPPRESSED';httpStatus:number|null;reason:string};
export function vehicleMessageBody(vehicleId:string,message:string){
 if(!/^[1-9]\d*$/.test(vehicleId)||!Number.isSafeInteger(Number(vehicleId)))throw Error('INVALID_VEHICLE_ID');
 if(!message.trim()||message.length>200||/[\r\n]/.test(message))throw Error('INVALID_VEHICLE_MESSAGE');
 return {text:message,vehicles:[Number(vehicleId)],companies:[],capabilities:[],zones:[]};
}
export function vehicleMessageUrl(base:string):string{
 const root=new URL(base);
 if(root.protocol!=='https:'||root.hostname!=='autocab-api.azure-api.net'||root.port||root.username||root.password||root.search||root.hash)throw Error('INVALID_VEHICLE_MESSAGE_ENDPOINT');
 return new URL('/vehicle/v1/vehicles/message',root).toString();
}
export function vehicleMessageOutcome(payload:unknown,vehicleId:string):VehicleMessageResult{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return {status:'UNKNOWN',httpStatus:200,reason:'INVALID_QUEUE_RESPONSE'};
 const body=payload as Record<string,unknown>;
 if(body.messagesQueued===false)return {status:'REJECTED',httpStatus:200,reason:'NOT_QUEUED'};
 const vehicles=body.vehicles;
 if(!vehicles||typeof vehicles!=='object'||Array.isArray(vehicles))return {status:'UNKNOWN',httpStatus:200,reason:'INVALID_QUEUE_RESPONSE'};
 const {workingVehicles,nonWorkingVehicles}=vehicles as Record<string,unknown>;
 if(body.messagesQueued!==true||!Array.isArray(workingVehicles)||!Array.isArray(nonWorkingVehicles)||workingVehicles.length!==1||workingVehicles[0]!==Number(vehicleId)||nonWorkingVehicles.length!==0)return {status:'UNKNOWN',httpStatus:200,reason:'UNCONFIRMED_TARGET_QUEUE'};
 return {status:'ACCEPTED',httpStatus:200,reason:'QUEUED_FOR_VEHICLE'};
}
export async function driverMessageConnection():Promise<VehicleMessageConnection|null>{
 // Reuse the same enabled shared Autocab credential used for the vehicle registry.
 // Neither a sample vehicle ID nor a driver ID is ever used as a recipient.
 const configuration=(await database().query<{baseUrl:string;apiKeyEncrypted:string|null;isEnabled:boolean}>(`SELECT "baseUrl","apiKeyEncrypted","isEnabled" FROM public."AutocabApiConfiguration" WHERE provider='AUTOCAB'`)).rows[0];
 if(!configuration?.isEnabled||!configuration.apiKeyEncrypted)return null;
 return {url:vehicleMessageUrl(configuration.baseUrl),apiKey:decryptWebhookSecret(configuration.apiKeyEncrypted)};
}
export async function requestVehicleMessage(connection:VehicleMessageConnection,vehicleId:string,message:string,request:typeof fetch=fetch):Promise<VehicleMessageResult>{
 if(connection.url!==vehicleMessageEndpoint||!connection.apiKey)throw Error('INVALID_VEHICLE_MESSAGE_CONNECTION');
 const body=vehicleMessageBody(vehicleId,message);
 // A timeout/5xx/malformed 200 can follow a provider write: never blindly retry.
 try{
  const response=await request(connection.url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','Ocp-Apim-Subscription-Key':connection.apiKey},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(response.status!==200){await response.body?.cancel();return {status:response.status>=400&&response.status<500?'REJECTED':'UNKNOWN',httpStatus:response.status,reason:'PROVIDER_HTTP_'+response.status}}
  try{const payload=JSON.parse(await boundedText(response,16384));return vehicleMessageOutcome(payload,vehicleId)}catch{return {status:'UNKNOWN',httpStatus:200,reason:'INVALID_QUEUE_RESPONSE'}}
 }catch{return {status:'UNKNOWN',httpStatus:null,reason:'UNCONFIRMED_PROVIDER_WRITE'}}
}
// Ban changes and final sends share a transaction lock. Once a save completes,
// no later traffic send can use the old list. Already queued messages cannot be recalled.
export async function deliverTrafficMessage(client:Pick<PoolClient,'query'>,connection:VehicleMessageConnection,vehicleId:string,message:string,driverId?:string,transport=requestVehicleMessage):Promise<VehicleMessageResult>{
 try{
  await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='12s'");await client.query(trafficBanLock);
  const result=await trafficMessageBlocked(client,vehicleId,driverId)?{status:'SUPPRESSED' as const,httpStatus:null,reason:'TRAFFIC_BAN_LIST'}:await transport(connection,vehicleId,message);
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
export async function sendDriverClosureMessage(connection:VehicleMessageConnection,vehicleId:string,message:string,driverId?:string){
 await requireAutocabIntegration();
 const client=await database().connect();
 try{return await deliverTrafficMessage(client,connection,vehicleId,message,driverId)}finally{client.release()}
}
