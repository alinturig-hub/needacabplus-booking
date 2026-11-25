import {pickupUpdateStage} from '../booking-pickup-update';
import {database,bookingAttemptDatabase} from '../database';
import {canonicalTaxiSnapshot,taxiState,type TaxiSnapshot} from './status';
import {alexaOrigins,decryptNotificationUser} from './notification-consent';
import {hash} from './policy';
type Subscription={principal:string;user_cipher:string|null;api_origin:string|null;enabled:boolean};
type Job={id:string;principal:string;booking_id:string;fingerprint:string;created_at:Date|string;attempts:number};
export function taxiUpdateFingerprint(row:TaxiSnapshot,now=Date.now()){
 const age=now-new Date(row.updatedAt).getTime(),state=taxiState(row.status);
 if(!Number.isFinite(age)||age< -10000||age>180000)return null;
 if(!['ACCEPTED','ARRIVED','CANCELLED','CANCELED','NOFARE'].includes(state))return null;
 if(['ACCEPTED','ARRIVED'].includes(state)&&(!row.driverId||!row.vehicleId))return null;
 const milestone=pickupUpdateStage(row,now)||state;
 return hash(JSON.stringify([row.externalId,milestone,row.driverId,row.vehicleId,row.registration,row.make,row.model,row.colour]));
}
export function alexaMessageEvent(job:Job,userId:string){
 const timestamp=new Date(job.created_at).toISOString();return {timestamp,referenceId:'NAC'+job.id,expiryTime:new Date(new Date(job.created_at).getTime()+3600000).toISOString(),event:{name:'AMAZON.MessageAlert.Activated',payload:{state:{status:'UNREAD',freshness:'NEW'},messageGroup:{creator:{name:'Need A Cab Plus'},count:1}}},localizedAttributes:[{locale:'en-GB'}],relevantAudience:{type:'Unicast',payload:{user:userId}}};
}
export async function sendAlexaUpdate(job:Job,subscription:Subscription,options:{env?:NodeJS.ProcessEnv;fetcher?:typeof fetch}={}){
 const env=options.env||process.env,fetcher=options.fetcher||fetch;
 if(env.ALEXA_NOTIFICATIONS_MODE!=='development'||!env.ALEXA_PROACTIVE_CLIENT_ID||!env.ALEXA_PROACTIVE_CLIENT_SECRET)throw Error('ALEXA_NOTIFICATIONS_NOT_CONFIGURED');
 if(!subscription.enabled||!subscription.user_cipher||!alexaOrigins.includes(subscription.api_origin||''))throw Error('NO_NOTIFICATION_CONSENT');
 const response=await fetcher('https://api.amazon.com/auth/o2/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.ALEXA_PROACTIVE_CLIENT_ID,client_secret:env.ALEXA_PROACTIVE_CLIENT_SECRET,scope:'alexa::proactive_events'}),signal:AbortSignal.timeout(2500)});
 if(!response.ok)throw Error('ALEXA_TOKEN_HTTP_'+response.status);
 const token=await response.json() as {access_token?:unknown};if(typeof token.access_token!=='string'||!token.access_token)throw Error('ALEXA_TOKEN_INVALID');
 const sent=await fetcher(subscription.api_origin+'/v1/proactiveEvents/stages/development',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token.access_token},body:JSON.stringify(alexaMessageEvent(job,decryptNotificationUser(subscription.user_cipher))),signal:AbortSignal.timeout(2500)});
 if(sent.status!==202)throw Error('ALEXA_EVENT_HTTP_'+sent.status);
}
const defaults={db:database,attempts:bookingAttemptDatabase,snapshot:canonicalTaxiSnapshot,send:sendAlexaUpdate,now:Date.now};
async function readSnapshot(read:()=>Promise<TaxiSnapshot|null>){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([read(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),4000);})]);}finally{clearTimeout(timer);}}
/** Polls the canonical webhook projection; never ingests a second booking copy. */
export async function runAlexaNotifications(services:Partial<typeof defaults>={}){
 if(process.env.ALEXA_NOTIFICATIONS_MODE!=='development'||!process.env.ALEXA_PROACTIVE_CLIENT_ID||!process.env.ALEXA_PROACTIVE_CLIENT_SECRET)return {enabled:false,queued:0,sent:0,omitted:0,failed:0,reason:'NOT_CONFIGURED'};
 const s={...defaults,...services},db=s.db(),result={enabled:true,queued:0,sent:0,omitted:0,failed:0};
 async function latest(principal:string){return (await s.attempts().query<{state:string;external_booking_id:string|null}>("SELECT state,external_booking_id FROM web_booking_attempts WHERE user_id=$1 AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1",['alexa-guest:'+principal])).rows[0];}
 await db.query("DELETE FROM alexa_notification_outbox WHERE created_at<now()-interval '24 hours' AND state<>'sending'");
 const subscribers=(await db.query<Subscription>('SELECT principal,user_cipher,api_origin,enabled FROM alexa_notification_subscriptions WHERE enabled=true ORDER BY last_polled_at NULLS FIRST LIMIT 3')).rows;
 for(const sub of subscribers){
  await db.query('UPDATE alexa_notification_subscriptions SET last_polled_at=now() WHERE principal=$1',[sub.principal]);
  try{
   const attempt=await latest(sub.principal);if(attempt?.state!=='confirmed'||!attempt.external_booking_id)continue;
   if(!(await db.query('SELECT booking_id FROM alexa_booking_updates WHERE principal=$1 AND booking_id=$2 AND opted_in=true',[sub.principal,attempt.external_booking_id])).rows.length)continue;
   const row=await readSnapshot(()=>s.snapshot(attempt.external_booking_id!));if(!row)continue;const fingerprint=taxiUpdateFingerprint(row,s.now());if(!fingerprint)continue;
   const id=hash(sub.principal+':'+attempt.external_booking_id+':'+fingerprint),inserted=await db.query('INSERT INTO alexa_notification_outbox(id,principal,booking_id,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[id,sub.principal,attempt.external_booking_id,fingerprint]);result.queued+=inserted.rows.length;
  }catch{result.failed++;}
 }
 // A crashed delivery can retry the same documented idempotent Amazon referenceId.
 await db.query("UPDATE alexa_notification_outbox SET state='pending' WHERE state='sending' AND next_attempt_at<now() AND attempts<3");
 await db.query("UPDATE alexa_notification_outbox SET state='omitted',last_error='EXPIRED' WHERE state IN ('pending','sending') AND (attempts>=3 OR created_at<now()-interval '1 hour')");
 const jobs=(await db.query<Job>("SELECT id,principal,booking_id,fingerprint,created_at,attempts FROM alexa_notification_outbox WHERE state='pending' AND next_attempt_at<=now() ORDER BY created_at LIMIT 3")).rows;
 for(const job of jobs){
  const claim=await db.query("UPDATE alexa_notification_outbox SET state='sending',attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' WHERE id=$1 AND state='pending' RETURNING id",[job.id]);if(!claim.rows.length)continue;
  try{
   const sub=(await db.query<Subscription>('SELECT principal,user_cipher,api_origin,enabled FROM alexa_notification_subscriptions WHERE principal=$1 AND enabled=true',[job.principal])).rows[0],attempt=await latest(job.principal);
   const row=attempt?.state==='confirmed'&&attempt.external_booking_id===job.booking_id?await readSnapshot(()=>s.snapshot(job.booking_id)):null;
   const optedIn=(await db.query('SELECT booking_id FROM alexa_booking_updates WHERE principal=$1 AND booking_id=$2 AND opted_in=true',[job.principal,job.booking_id])).rows.length>0;
   if(!sub||!optedIn||!row||taxiUpdateFingerprint(row,s.now())!==job.fingerprint){await db.query("UPDATE alexa_notification_outbox SET state='omitted',last_error='SUPERSEDED_OR_NO_CONSENT' WHERE id=$1",[job.id]);result.omitted++;continue;}
   await s.send(job,sub);
   await db.query("UPDATE alexa_notification_outbox SET state='sent',last_error=NULL WHERE id=$1",[job.id]);result.sent++;
  }catch(error){
   const code=error instanceof Error&&/^ALEXA_[A-Z_]+(?:_\d{3})?$/.test(error.message)?error.message:'ALEXA_DELIVERY_UNKNOWN';
   await db.query("UPDATE alexa_notification_outbox SET state=CASE WHEN attempts>=3 THEN 'omitted' ELSE 'pending' END,next_attempt_at=now()+interval '2 minutes',last_error=$2 WHERE id=$1",[job.id,code]);result.failed++;
  }
 }
 return result;
}
