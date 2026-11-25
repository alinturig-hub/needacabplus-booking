import {database} from '../database';
import {hash} from './policy';
import {sendAlexaUpdate} from './notifications';
import {decryptNotificationUser} from './notification-consent';
const defaults={db:database,send:sendAlexaUpdate,now:Date.now};
function configured(){return process.env.ALEXA_NOTIFICATIONS_MODE==='development'&&!!process.env.ALEXA_PROACTIVE_CLIENT_ID&&!!process.env.ALEXA_PROACTIVE_CLIENT_SECRET;}
/** Internal operator diagnostics. No raw Amazon identity, phone or credentials. */
export async function notificationTestStatus(services:Partial<typeof defaults>={}){
 const s={...defaults,...services};
 const rows=(await s.db().query<{principal:string;enabled:boolean;consent_at:Date|string;last_voice_at:Date|string|null}>(`SELECT sub.principal,sub.enabled,sub.consent_at,
 (SELECT max(r.created_at) FROM alexa_guest_requests r WHERE r.principal=sub.principal AND r.response->'response'->'outputSpeech' IS NOT NULL) last_voice_at
 FROM alexa_notification_subscriptions sub ORDER BY sub.consent_at DESC LIMIT 10`)).rows;
 return {configured:configured(),subscriptions:rows.map(row=>({...row,recentVoice:!!row.last_voice_at&&s.now()-new Date(row.last_voice_at).getTime()>=0&&s.now()-new Date(row.last_voice_at).getTime()<=15*60000}))};
}
/** Explicit operator test only; never creates a quote, booking or booking preference. */
export async function testAlexaNotification(principal:string,services:Partial<typeof defaults>={}){
 if(!configured())return {state:'disabled'};
 if(!/^[a-f0-9]{64}$/.test(principal))return {state:'invalid_recipient'};
 const s={...defaults,...services},db=s.db();
 async function subscribed(){return (await db.query<{principal:string;enabled:boolean;user_cipher:string|null;api_origin:string|null}>(`SELECT principal,enabled,user_cipher,api_origin FROM alexa_notification_subscriptions sub WHERE principal=$1 AND enabled=true
 AND EXISTS(SELECT 1 FROM alexa_guest_requests r WHERE r.principal=sub.principal AND r.created_at>now()-interval '15 minutes' AND r.response->'response'->'outputSpeech' IS NOT NULL)`,[principal])).rows[0];}
 const sub=await subscribed();if(!sub)return {state:'no_verified_recent_recipient'};
 if(!sub.user_cipher||hash(decryptNotificationUser(sub.user_cipher))!==principal)return {state:'invalid_recipient'};
 // One claim per recipient per hour, committed before transport. An uncertain
 // send is not retried automatically, including after a restart.
 const id=hash('alexa-notification-test:'+principal+':'+new Date(s.now()).toISOString().slice(0,13));
 const claim=await db.query<{created_at:Date|string}>(`INSERT INTO alexa_guest_requests(principal,request_hash,response) VALUES($1,$2,$3::jsonb)
 ON CONFLICT DO NOTHING RETURNING created_at`,[principal,id,JSON.stringify({kind:'notification-test',state:'sending'})]);
 if(!claim.rows.length){const prior=(await db.query<{response:{state:string}}>('SELECT response FROM alexa_guest_requests WHERE principal=$1 AND request_hash=$2',[principal,id])).rows[0];return {state:prior?.response.state||'unknown',duplicate:true};}
 let state='unknown',error:string|undefined;
 try{
  const current=await subscribed();
  if(!current){state='omitted';error='NO_CONSENT';}
  else{await s.send({id,principal,booking_id:'notification-test',fingerprint:id,created_at:claim.rows[0].created_at,attempts:1},current);state='accepted';}
 }catch(e){error=e instanceof Error&&/^ALEXA_[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'ALEXA_TEST_DELIVERY_UNKNOWN';}
 await db.query('UPDATE alexa_guest_requests SET response=$3::jsonb WHERE principal=$1 AND request_hash=$2',[principal,id,JSON.stringify({kind:'notification-test',state,...(error?{error}:{})})]);
 return {state,...(error?{error}:{})};
}
