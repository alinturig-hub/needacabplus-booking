import {synchronizeControlledResult} from './notifications/controlled/app';
import type {ControlledResult} from './notifications/controlled/protocol';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {signedHeaders,verifyService,boundedBody} from './whatsapp-service-auth';
export function whatsappGatewayEnabled(){return process.env.WHATSAPP_SHARED_ENABLED==='true';}
export function gatewayScope(){const workspace=process.env.WHATSAPP_WORKSPACE_ID,waba=process.env.WHATSAPP_WABA_ID,phone=process.env.WHATSAPP_PHONE_NUMBER_ID;if(!workspace||!/^[a-zA-Z0-9_-]{1,64}$/.test(workspace)||!/^\d{5,32}$/.test(waba||'')||!/^\d{5,32}$/.test(phone||''))throw Error('WHATSAPP_SERVICE_NOT_CONFIGURED');return `${workspace}:META:${waba}:${phone}`;}
export function normalizeWhatsAppPhone(value:string){const compact=value.replace(/[ ()-]/g,'');if(/^\+[1-9]\d{7,14}$/.test(compact))return compact;if(/^07\d{9}$/.test(compact))return '+44'+compact.slice(1);throw Error('UNVERIFIED_PHONE_FORMAT');}
/** Poll durable confirmed attempts rather than putting a network side effect in booking creation.
 * Reconciliation also catches recovered UNKNOWN -> confirmed attempts after a process crash. */
export async function captureConfirmedNotifications(db:Pool,now=new Date()){
 if(!whatsappGatewayEnabled())return 0;gatewayScope();
 const rows=await db.query(`SELECT quote_id,external_booking_id,request_body,updated_at FROM web_booking_attempts a WHERE NOT EXISTS(SELECT 1 FROM whatsapp_notification_outbox n WHERE n.payload->>'booking_id'='autocab:'||a.external_booking_id AND n.payload->>'event_type'='booking.confirmed') AND state='confirmed' AND external_booking_id IS NOT NULL AND updated_at >= $1 AND updated_at <= $2 ORDER BY updated_at,quote_id LIMIT 1000`,[new Date(now.getTime()-86400000),now]);let captured=0;
 for(const r of rows.rows){
 // Expired confirmations are never replayed. Autocab ID is the cross-application booking identity.
 const expiry=new Date(new Date(r.updated_at).getTime()+15*60000);if(expiry<=now)continue;
 let recipient;try{recipient=normalizeWhatsAppPhone(r.request_body?.telephoneNumber||'');}catch{continue;}
 const booking_id='autocab:'+r.external_booking_id,event_type='booking.confirmed',revision=1,idempotency_key=`${booking_id}:${event_type}:${recipient}:${revision}`;
 const payload={schema_version:'1.0',workspace_id:process.env.WHATSAPP_WORKSPACE_ID,idempotency_key,recipient,booking_id,event_type,revision,template_binding:event_type,parameters:[String(r.external_booking_id)],expires_at:expiry.toISOString()};
 const saved=await db.query(`INSERT INTO whatsapp_notification_outbox(operation_key,payload,expires_at) VALUES($1,$2::jsonb,$3) ON CONFLICT(operation_key) DO NOTHING`,[idempotency_key,JSON.stringify(payload),expiry]);captured+=saved.rowCount||0;
 }return captured;
}
export async function flushNotifications(db:Pool,fetcher:typeof fetch=fetch){
 if(!whatsappGatewayEnabled())return 0;gatewayScope();const origin=new URL(process.env.WHATSAPP_GATEWAY_ORIGIN||'');if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('INVALID_GATEWAY');const url=new URL('/api/internal/whatsapp/v1/message-intents',origin);
 const key=process.env.WHATSAPP_NAC_KEY_ID||'',secret=process.env.WHATSAPP_NAC_SECRET||'';if(!key||secret.length<32)throw Error('WHATSAPP_SERVICE_NOT_CONFIGURED');let accepted=0;
 await db.query(`UPDATE whatsapp_notification_outbox SET status='EXPIRED' WHERE status='QUEUED' AND expires_at<=now()`);
 for(let i=0;i<10;i++){
 // Lease is committed before network IO. Concurrent workers skip already leased rows.
 const row=(await db.query(`UPDATE whatsapp_notification_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '60 seconds' WHERE id=(SELECT id FROM whatsapp_notification_outbox WHERE status='QUEUED' AND expires_at>now() AND next_attempt_at<=now() AND attempts<12 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0];if(!row)break;
 const body=JSON.stringify(row.payload);try{const response=await fetcher(url,{method:'POST',body,headers:{'Content-Type':'application/json',...signedHeaders('POST',url.pathname,body,key,secret)},redirect:'error',signal:AbortSignal.timeout(8000)});
 if(response.status===202){const result=await response.json() as {id?:unknown;status?:unknown};if(typeof result.id!=='string'||!['HELD','SENDING','ACCEPTED','UNKNOWN','REJECTED','CANCELLED','EXPIRED'].includes(String(result.status)))throw Error('INVALID_GATEWAY_RESPONSE');await db.query(`UPDATE whatsapp_notification_outbox SET status=$2,gateway_id=$3 WHERE id=$1`,[row.id,result.status==='CANCELLED'?'CANCELLED':result.status==='EXPIRED'?'EXPIRED':result.status==='REJECTED'?'BLOCKED':'ACCEPTED',result.id]);accepted++;}
 else if([403,409,422].includes(response.status))await db.query(`UPDATE whatsapp_notification_outbox SET status='BLOCKED' WHERE id=$1`,[row.id]);
 else throw Error('GATEWAY_UNAVAILABLE');
 }catch{await db.query(`UPDATE whatsapp_notification_outbox SET next_attempt_at=now()+($2*interval '1 second') WHERE id=$1`,[row.id,Math.min(3600,2**row.attempts*10)+Math.floor(Math.random()*10)]);}
 }return accepted;
}
export async function receiveGatewayEvent(db:Pool,request:Request){
 if(!whatsappGatewayEnabled())throw Error('WHATSAPP_SERVICE_NOT_CONFIGURED');const body=await boundedBody(request),scope=gatewayScope();
 await verifyService(request,body,process.env.WHATSAPP_CRM_KEY_ID||'',process.env.WHATSAPP_CRM_SECRET||'',async id=>!!(await db.query(`INSERT INTO whatsapp_service_nonce(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id`,[id])).rowCount);
 let event;try{event=JSON.parse(body);}catch{throw Error('INVALID_EVENT');}
 if(event.schema_version!=='1.0'||event.scope!==scope||typeof event.event_id!=='string'||!/^\d{1,19}$/.test(event.event_id)||!['message.received','message.status','message.accepted','conversation.mode_changed'].includes(event.type)||!event.payload||typeof event.payload!=='object')throw Error('INVALID_EVENT');
 const hash=createHash('sha256').update(body).digest('hex');await db.query(`INSERT INTO whatsapp_event_inbox(event_id,scope,event_type,payload,request_hash) VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(event_id) DO NOTHING`,[event.event_id,scope,event.type,JSON.stringify(event.payload),hash]);
 const saved=(await db.query(`SELECT request_hash FROM whatsapp_event_inbox WHERE event_id=$1`,[event.event_id])).rows[0];if(saved.request_hash!==hash)throw Error('EVENT_CONFLICT');if(event.payload.controlled_test===true&&['message.accepted','message.status'].includes(event.type))await synchronizeControlledResult(db,{...event.payload,scope:event.scope} as ControlledResult);return {received:true,event_id:event.event_id};
}
