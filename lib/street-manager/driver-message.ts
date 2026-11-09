import {database} from '../database';
import {decryptCredentials} from '../credentials';
import {requireAutocabIntegration} from '../integration-control';
export const driverMessageAction='driver.road-closure-message';
type Connection={base_url:string;auth_type:string;api_key_header:string;credentials_encrypted:string;method:string;path:string;request_example:unknown};
export function driverMessageBody(template:unknown,driverId:string,message:string):unknown{
 let recipients=0,messages=0;
 const visit=(value:unknown,depth=0):unknown=>{
  if(depth>12)throw Error('INVALID_DRIVER_MESSAGE_TEMPLATE');
  if(value==='{{driverId}}'){recipients++;return driverId}
  if(value==='{{driverId:number}}'){recipients++;if(!/^[1-9]\d*$/.test(driverId)||!Number.isSafeInteger(Number(driverId)))throw Error('INVALID_DRIVER_ID');return Number(driverId)}
  if(value==='{{message}}'){messages++;return message}
  if(typeof value==='string'&&value.includes('{{'))throw Error('INVALID_DRIVER_MESSAGE_TEMPLATE');
  if(Array.isArray(value))return value.map(v=>visit(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,visit(v,depth+1)]));
  return value;
 };
 const result=visit(template);
 if(!result||typeof result!=='object'||Array.isArray(result)||recipients!==1||messages!==1)throw Error('INVALID_DRIVER_MESSAGE_TEMPLATE');
 return result;
}
export function driverMessageUrl(base:string,path:string,method:string):URL{
 const root=new URL(base),url=new URL(path,root.href.endsWith('/')?root.href:root.href+'/');
 if(root.protocol!=='https:'||url.origin!==root.origin||url.username||url.password||url.hash||method.toUpperCase()!=='POST')throw Error('INVALID_DRIVER_MESSAGE_ENDPOINT');
 return url;
}
export async function driverMessageConnection(){
 const result=await database().query<Connection>(`SELECT c.base_url,c.auth_type,c.api_key_header,c.credentials_encrypted,e.method,e.path,e.request_example
 FROM api_endpoints e JOIN api_connections c ON c.id=e.connection_id WHERE c.provider='autocab' AND e.action_key=$1 AND e.enabled ORDER BY e.created_at DESC LIMIT 1`,[driverMessageAction]);
 const connection=result.rows[0];if(!connection)return null;
 driverMessageUrl(connection.base_url,connection.path,connection.method);
 driverMessageBody(connection.request_example,'1','Template validation only');
 return connection;
}
export async function sendDriverClosureMessage(connection:Connection,driverId:string,message:string):Promise<{status:'ACCEPTED'|'REJECTED'|'UNKNOWN';httpStatus:number|null}>{
 const url=driverMessageUrl(connection.base_url,connection.path,connection.method),body=driverMessageBody(connection.request_example,driverId,message);
 await requireAutocabIntegration();
 const credentials=decryptCredentials(connection.credentials_encrypted),headers=new Headers({'Content-Type':'application/json',Accept:'application/json'});
 if(connection.auth_type==='api_key'){if(!credentials.token)throw Error('DRIVER_MESSAGE_AUTH_UNAVAILABLE');headers.set(connection.api_key_header,credentials.token)}
 else if(connection.auth_type==='bearer'){if(!credentials.token)throw Error('DRIVER_MESSAGE_AUTH_UNAVAILABLE');headers.set('Authorization','Bearer '+credentials.token)}
 else if(connection.auth_type==='basic'){if(!credentials.username||!credentials.password)throw Error('DRIVER_MESSAGE_AUTH_UNAVAILABLE');headers.set('Authorization','Basic '+Buffer.from(credentials.username+':'+credentials.password).toString('base64'))}
 else throw Error('DRIVER_MESSAGE_AUTH_REQUIRED');
 // No automatic retry: a timeout/5xx may follow a successful provider write.
 try{const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});await response.body?.cancel();return {status:response.ok?'ACCEPTED':response.status>=400&&response.status<500?'REJECTED':'UNKNOWN',httpStatus:response.status}}catch{return {status:'UNKNOWN',httpStatus:null}}
}
