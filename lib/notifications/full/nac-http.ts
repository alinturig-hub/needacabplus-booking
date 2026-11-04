import {recordDecision} from '../store';
import type {Decision} from '../model';
import {randomUUID} from 'node:crypto';
import {database} from '../../database';
import {boundedBody,verifyService,signedHeaders} from '../../whatsapp-service-auth';
import {fullStageGuard} from './guard';
import {loadFullContext,storedRule} from './data';
import {evaluateContext} from '../v2/context';
import {previewIntent} from '../v2/producer';
import {stable,type ResultV2} from '../v2/contract';
import {v2Error} from '../v2/http';
import {canonicalNotificationBooking} from '../canonical';
import {normalizeJourneyPhone} from '../../whatsapp-journey';
export async function nacStageAuth(request:Request,identity:'NAC'|'CRM'='NAC'){
 fullStageGuard();const body=await boundedBody(request);
 await verifyService(request,body,process.env['WHATSAPP_'+identity+'_KEY_ID']||'',process.env['WHATSAPP_'+identity+'_SECRET']||'',async id=>{await database().query('CREATE TABLE IF NOT EXISTS whatsapp_service_nonce(id text PRIMARY KEY,created_at timestamptz DEFAULT now())');return !!(await database().query('INSERT INTO whatsapp_service_nonce(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[id])).rowCount});
 return JSON.parse(body) as Record<string,unknown>;
}
export async function fullContextPOST(request:Request){try{const input=await nacStageAuth(request,'CRM'),scope=fullStageGuard();let revision='';const decision=await evaluateContext(input,scope.workspace,async i=>{const loaded=await loadFullContext(i);revision=loaded.revision;return loaded});return Response.json({decision,revision},{headers:{'Cache-Control':'no-store'}})}catch(e){return v2Error(e)}}
export async function bookingEventPOST(request:Request){try{
 const input=await nacStageAuth(request),{workspace}=fullStageGuard();if(Object.keys(input).some(k=>!['booking_id','rule_id','occurred_at','revision'].includes(k))||typeof input.booking_id!=='string'||!/^SYNTHETIC-[a-zA-Z0-9_-]+$/.test(input.booking_id)||typeof input.rule_id!=='string'||typeof input.occurred_at!=='string'||!Number.isSafeInteger(input.revision))throw Error('INVALID_STAGE_EVENT');
 const rule=await storedRule(input.rule_id),booking=await canonicalNotificationBooking(input.booking_id,rule.event);if(!booking)throw Error('STAGE_BOOKING_NOT_FOUND');
 const row=(await database().query('SELECT * FROM "Booking" WHERE "externalId"=$1',[booking.id])).rows[0],recipient=normalizeJourneyPhone(row.telephoneNumber||'');
 // Intent descriptor is built from stored policy; canonical fields are fetched again by the callback.
 const template=(await database().query('SELECT definition FROM notification_stage_template WHERE id=$1',[rule.template.id])).rows[0]?.definition;
 const canonicalAt=rule.event==='booking.confirmed'?row.bookedAtTime:row.acceptedAt;
 if(!canonicalAt||new Date(canonicalAt).toISOString()!==input.occurred_at||booking.revision!==input.revision)throw Error('INVALID_CANONICAL_EVENT');
 const context={now:new Date().toISOString(),event:{bookingId:booking.id,type:rule.event,revision:Number(input.revision),occurredAt:input.occurred_at},booking,synthetic:true,template} as Parameters<typeof previewIntent>[1];
 const intent=previewIntent(rule,context,workspace,recipient),db=database();
 await db.query('INSERT INTO notification_stage_intent(operation_key,request_id,request,intent) VALUES($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT DO NOTHING',[intent.idempotency_key,randomUUID(),JSON.stringify(input),JSON.stringify(intent)]);
 const saved=(await db.query('SELECT * FROM notification_stage_intent WHERE operation_key=$1',[intent.idempotency_key])).rows[0];if(saved.result)return Response.json({...saved.result,reused:true});if(stable(saved.intent)!==stable(intent))throw Error('IDEMPOTENCY_CONFLICT');
 const path='/api/internal/whatsapp/v2/notification-preview',body=JSON.stringify(intent),url=new URL(path,process.env.WHATSAPP_GATEWAY_ORIGIN);
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...signedHeaders('POST',path,body,process.env.WHATSAPP_NAC_KEY_ID||'',process.env.WHATSAPP_NAC_SECRET||'')},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('STAGE_GATEWAY_UNAVAILABLE');const result=await r.json() as ResultV2;
 if(result.mode!=='DRY_RUN'||result.provider_called!==false||result.idempotency_key!==intent.idempotency_key)throw Error('INVALID_STAGE_GATEWAY_RESULT');
 const decision=JSON.parse(JSON.stringify({mode:'DRY_RUN',wouldSend:result.result==='ready',result:result.result,reason:result.reason,channel:result.channel,bookingId:booking.id,event:rule.event,eventRevision:intent.revision,ruleId:result.rule.id,ruleVersion:result.rule.version,idempotencyKey:intent.idempotency_key,decidedAt:result.checked_at,providerStatus:result.provider_status,conversationId:result.conversation_id,windowOpen:result.content_mode==='text',contentMode:result.content_mode,content:result.rendered_text,mappingValues:result.body_parameters,buttonValues:result.button_parameters,issues:result.explanations||[]})) as Decision;
 await recordDecision(db,saved.request_id,decision);
 await db.query('UPDATE notification_stage_intent SET result=$2::jsonb WHERE operation_key=$1 AND result IS NULL',[intent.idempotency_key,JSON.stringify(result)]);
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return v2Error(e)}}
