import type {AlexaLocationContext} from './location';
import {database} from '../database';
import {hash} from './policy';
export const REMINDER_SCOPE='alexa::alerts:reminders:skill:readwrite';
const origins=['https://api.amazonalexa.com','https://api.eu.amazonalexa.com','https://api.fe.amazonalexa.com'];
export function reminderPermission(context:AlexaLocationContext|undefined){return context?.System.user?.permissions?.scopes?.[REMINDER_SCOPE]?.status==='GRANTED';}
function endpoint(context:AlexaLocationContext|undefined){const origin=context?.System.apiEndpoint;return origin&&origins.includes(origin)?origin:null;}
export function reminderSessionReady(context:AlexaLocationContext|undefined){return reminderPermission(context)&&!!context?.System.apiAccessToken&&!!endpoint(context);}
export const phoneReminderBody=(now=Date.now())=>({requestTime:new Date(now).toISOString(),trigger:{type:'SCHEDULED_RELATIVE',offsetInSeconds:60},alertInfo:{spokenInfo:{content:[{locale:'en-GB',text:'This is your test reminder.'}]}},pushNotification:{status:'ENABLED'}});
const defaults={db:database,fetcher:fetch,now:Date.now};
/** Called only after a fresh in-session Yes to the one-minute test offer.
 * The session token is used once in memory, never saved or logged.
 */
export async function createPhoneReminder(principal:string,context:AlexaLocationContext|undefined,services:Partial<typeof defaults>={}){
 if(process.env.ALEXA_NOTIFICATIONS_MODE!=='development')return {state:'disabled'};
 if(!reminderSessionReady(context))return {state:'permission_required'};
 const s={...defaults,...services},db=s.db(),owner=hash(principal),id=hash('phone-reminder-test:'+owner+':'+new Date(s.now()).toISOString().slice(0,13));
 // A separate committed claim prevents a transport timeout or replay from
 // creating a second reminder when the surrounding conversation rolls back.
 const claim=await db.query(`INSERT INTO alexa_guest_requests(principal,request_hash,response) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING request_hash`,[owner,id,JSON.stringify({kind:'phone-reminder-test',state:'creating'})]);
 if(!claim.rows.length){const old=(await db.query<{response:{state:string}}>('SELECT response FROM alexa_guest_requests WHERE principal=$1 AND request_hash=$2',[owner,id])).rows[0];return {state:old?.response.state||'unknown',duplicate:true};}
 let state='unknown',error:string|undefined;
 try{
  const response=await s.fetcher(endpoint(context)!+'/v1/alerts/reminders',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+context!.System.apiAccessToken},body:JSON.stringify(phoneReminderBody(s.now())),signal:AbortSignal.timeout(3000)});
  if(response.status===201){const result=await response.json() as {alertToken?:unknown};if(typeof result.alertToken==='string'&&result.alertToken.length>0)state='created';else error='REMINDER_RESPONSE_UNKNOWN';}
  else{error='REMINDER_HTTP_'+response.status;if([400,401,403,404,429].includes(response.status))state='rejected';}
 }catch{error='REMINDER_TRANSPORT_UNKNOWN';}
 await db.query('UPDATE alexa_guest_requests SET response=$3::jsonb WHERE principal=$1 AND request_hash=$2',[owner,id,JSON.stringify({kind:'phone-reminder-test',state,...(error?{error}:{})})]);
 return {state,...(error?{error}:{})};
}
