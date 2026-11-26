import {autocabIso} from '../autocab-time.mjs';
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes} from 'node:crypto';
import {database} from '../database';
import {hash,equalSecret} from './policy';
import {reminderSessionReady} from './phone-reminder';
import {alexaOrigins} from './notification-consent';
import type {AlexaLocationContext} from './location';
const INITIAL='This is your scheduled test reminder.';
export const UPDATED_REMINDER_TEXT='This reminder was updated after the conversation ended.';
const defaults={db:database,fetcher:fetch,now:Date.now};
type TestRow={id:string;principal:string;user_cipher:string;alert_cipher:string|null;api_origin:string;state:string;scheduled_at:Date|string};
function secret(){const s=process.env.ADMIN_SESSION_SECRET;if(!s||s.length<32)throw Error('REMINDER_TEST_KEY_UNAVAILABLE');return s;}
function key(kind:string){return createHash('sha256').update('alexa-reminder-test:v1:'+kind+':'+secret()).digest();}
export function encryptReminderValue(value:string,kind:'user'|'alert'){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(kind),iv);c.setAAD(Buffer.from(kind));const b=Buffer.concat([c.update(value,'utf8'),c.final()]);return [iv,c.getAuthTag(),b].map(x=>x.toString('base64url')).join('.');}
export function decryptReminderValue(value:string,kind:'user'|'alert'){const parts=value.split('.');if(parts.length!==3)throw Error('REMINDER_TEST_INVALID_CIPHER');const [iv,tag,body]=parts.map(x=>Buffer.from(x,'base64url'));const c=createDecipheriv('aes-256-gcm',key(kind),iv);c.setAAD(Buffer.from(kind));c.setAuthTag(tag);return Buffer.concat([c.update(body),c.final()]).toString('utf8');}
export function reminderTestCapability(id:string,principal:string){return createHmac('sha256',secret()).update('alexa-reminder-update:v1:'+id+':'+principal).digest('hex');}
export function reminderUpdateBody(scheduledAt:Date|string,updated=false,now=Date.now()){return {requestTime:new Date(now).toISOString(),trigger:{type:'SCHEDULED_ABSOLUTE',scheduledTime:new Date(scheduledAt).toISOString(),timeZoneId:'UTC'},alertInfo:{spokenInfo:{content:[{locale:'en-GB',text:updated?UPDATED_REMINDER_TEXT:INITIAL}]}},pushNotification:{status:'ENABLED'}};}
export async function createReminderUpdateTest(principal:string,context:AlexaLocationContext|undefined,services:Partial<typeof defaults>={}){
 if(process.env.ALEXA_NOTIFICATIONS_MODE!=='development')return {state:'disabled'};
 if(!reminderSessionReady(context))return {state:'permission_required'};
 const s={...defaults,...services},db=s.db(),owner=hash(principal),now=s.now(),id=hash('reminder-update-test:'+owner+':'+new Date(now).toISOString().slice(0,13)),scheduled=new Date(Math.ceil((now+5*60000)/1000)*1000),origin=context!.System.apiEndpoint!;
 const claim=await db.query(`INSERT INTO alexa_reminder_update_tests(id,principal,user_cipher,api_origin,state,scheduled_at,send_after) VALUES($1,$2,$3,$4,'creating',$5,$6) ON CONFLICT DO NOTHING RETURNING id`,[id,owner,encryptReminderValue(principal,'user'),origin,scheduled,new Date(now+30000)]);
 if(!claim.rows.length)return {state:'unknown',duplicate:true};
 let state='unknown',alert:string|null=null,error:string|null=null;
 try{
  const response=await s.fetcher(origin+'/v1/alerts/reminders',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+context!.System.apiAccessToken},body:JSON.stringify(reminderUpdateBody(scheduled,false,s.now())),signal:AbortSignal.timeout(2500)});
  if(response.status===201){const value=await response.json() as {alertToken?:unknown};if(typeof value.alertToken==='string'&&value.alertToken.length>0&&value.alertToken.length<=2048){alert=encryptReminderValue(value.alertToken,'alert');state='ready';}else error='REMINDER_RESPONSE_UNKNOWN';}
  else{error='REMINDER_HTTP_'+response.status;if([400,401,403,404,429].includes(response.status))state='failed';}
 }catch{error='REMINDER_TRANSPORT_UNKNOWN';}
 await db.query('UPDATE alexa_reminder_update_tests SET state=$2,alert_cipher=$3,last_error=$4,updated_at=now() WHERE id=$1',[id,state,alert,error]);
 return {state:state==='ready'?'created':state==='failed'?'rejected':'unknown'};
}
/** Sends only a capability-protected callback request; never creates a reminder. */
export async function runReminderUpdateTests(services:Partial<typeof defaults>={}){
 if(process.env.ALEXA_NOTIFICATIONS_MODE!=='development'||!process.env.ALEXA_PROACTIVE_CLIENT_ID||!process.env.ALEXA_PROACTIVE_CLIENT_SECRET)return {queued:0,failed:0};
 const s={...defaults,...services},db=s.db(),result={queued:0,failed:0};
 await db.query("DELETE FROM alexa_reminder_update_tests WHERE created_at<now()-interval '24 hours'");
 await db.query("UPDATE alexa_reminder_update_tests SET state='expired',updated_at=now() WHERE state IN ('creating','ready','queued','updating') AND scheduled_at<=now()+interval '20 seconds'");
 const rows=(await db.query<TestRow>("SELECT * FROM alexa_reminder_update_tests WHERE state='ready' AND send_after<=now() AND scheduled_at>now()+interval '20 seconds' ORDER BY send_after LIMIT 2")).rows;
 for(const row of rows){
  if(!alexaOrigins.includes(row.api_origin)||!row.alert_cipher)continue;
  if(!(await db.query("UPDATE alexa_reminder_update_tests SET state='queued',attempts=attempts+1,updated_at=now() WHERE id=$1 AND state='ready' RETURNING id",[row.id])).rows.length)continue;
  try{
   const tokenResponse=await s.fetcher('https://api.amazon.com/auth/o2/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:process.env.ALEXA_PROACTIVE_CLIENT_ID!,client_secret:process.env.ALEXA_PROACTIVE_CLIENT_SECRET!,scope:'alexa:skill_messaging'}),signal:AbortSignal.timeout(2000)});
   if(!tokenResponse.ok)throw Error('REMINDER_MESSAGE_TOKEN_HTTP_'+tokenResponse.status);
   const token=await tokenResponse.json() as {access_token?:unknown};if(typeof token.access_token!=='string'||!token.access_token)throw Error('REMINDER_MESSAGE_TOKEN_INVALID');
   const user=decryptReminderValue(row.user_cipher,'user');if(hash(user)!==row.principal)throw Error('REMINDER_MESSAGE_OWNER_MISMATCH');
   const sent=await s.fetcher(row.api_origin+'/v1/skillmessages/users/'+encodeURIComponent(user),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token.access_token},body:JSON.stringify({data:{operation:'REMINDER_UPDATE_TEST',testId:row.id,capability:reminderTestCapability(row.id,row.principal)},expiresAfterSeconds:120}),signal:AbortSignal.timeout(2500)});
   if(sent.status!==202)throw Error('REMINDER_MESSAGE_HTTP_'+sent.status);result.queued++;
  }catch(e){const code=e instanceof Error&&/^REMINDER_[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'REMINDER_MESSAGE_UNKNOWN';await db.query("UPDATE alexa_reminder_update_tests SET state='unknown',last_error=$2,updated_at=now() WHERE id=$1 AND state='queued'",[row.id,code]);result.failed++;}
 }
 return result;
}
export type ReminderCallback={principal:string;testId:string;capability:string;apiOrigin:string;apiAccessToken:string};
/** Signed Messaging.MessageReceived path. Fixed text and fixed original due time. */
export async function handleReminderUpdateMessage(input:ReminderCallback,services:Partial<typeof defaults>={}){
 if(process.env.ALEXA_NOTIFICATIONS_MODE!=='development')return {state:'disabled'};
 const s={...defaults,...services},db=s.db(),owner=hash(input.principal);
 if(!equalSecret(reminderTestCapability(input.testId,owner),input.capability))return {state:'forbidden'};
 const row=(await db.query<TestRow>('SELECT * FROM alexa_reminder_update_tests WHERE id=$1 AND principal=$2',[input.testId,owner])).rows[0];
 if(!row||row.api_origin!==input.apiOrigin||!alexaOrigins.includes(input.apiOrigin)||!row.alert_cipher)return {state:'forbidden'};
 if(row.state==='updated')return {state:'updated',duplicate:true};
 if(!['ready','queued'].includes(row.state)||new Date(row.scheduled_at).getTime()<=s.now()+20000)return {state:'expired_or_inactive'};
 if(!(await db.query("UPDATE alexa_reminder_update_tests SET state='updating',updated_at=now() WHERE id=$1 AND state IN ('ready','queued') RETURNING id",[row.id])).rows.length)return {state:'already_processing'};
 let state='unknown',error:string|null=null;
 try{
  const url=input.apiOrigin+'/v1/alerts/reminders/'+encodeURIComponent(decryptReminderValue(row.alert_cipher,'alert'));
  const headers={Authorization:'Bearer '+input.apiAccessToken,'Content-Type':'application/json'};
  const read=await s.fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(2000)});if(!read.ok)throw Error('REMINDER_READ_HTTP_'+read.status);
  const existing=await read.json() as {status?:unknown;trigger?:{type?:unknown;scheduledTime?:unknown;timeZoneId?:unknown}};if(existing.status!=='ON')throw Error('REMINDER_NO_LONGER_ACTIVE');
  const time=existing.trigger?.scheduledTime;const stamp=typeof time==='string'?(/(?:Z|[+-]\d\d:\d\d)$/i.test(time)?Date.parse(time):['UTC','Etc/UTC'].includes(String(existing.trigger?.timeZoneId))?Date.parse(time+'Z'):existing.trigger?.timeZoneId==='Europe/London'?Date.parse(autocabIso(time)||''):NaN):NaN;
  if(existing.trigger?.type!=='SCHEDULED_ABSOLUTE'||stamp!==new Date(row.scheduled_at).getTime())throw Error('REMINDER_CHANGED_BY_CUSTOMER');
  const updated=await s.fetcher(url,{method:'PUT',redirect:'error',headers,body:JSON.stringify(reminderUpdateBody(row.scheduled_at,true,s.now())),signal:AbortSignal.timeout(2500)});
  if(updated.status!==200)throw Error('REMINDER_UPDATE_HTTP_'+updated.status);state='updated';
 }catch(e){error=e instanceof Error&&/^REMINDER_[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'REMINDER_UPDATE_UNKNOWN';}
 await db.query('UPDATE alexa_reminder_update_tests SET state=$2,last_error=$3,updated_at=now() WHERE id=$1',[row.id,state,error]);return {state};
}
