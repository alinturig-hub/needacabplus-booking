/** Local isolated PostgreSQL + full Next routes only. No Meta token, HTTP transport or live DB. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {saveRule} from '../../../lib/notifications/store';
import {sampleRule} from '../../../lib/notifications/fixtures';
import {stable,type ResultV2} from '../../../lib/notifications/v2/contract';
type SharedHistory={messages:{status:string;content:{provider_payload:Record<string,unknown>}}[];notification_decisions:unknown[];shared_events:unknown[];real_queued_intents:number};
import {signedHeaders} from '../../../lib/whatsapp-service-auth';
async function main(){
 const config=JSON.parse(readFileSync(process.env.NOTIFICATIONS_FULL_STAGE_CONFIG||'','utf8'));
 const recipient=process.env.CONTROLLED_TEST_RECIPIENT||'';assert.match(recipient,/^\+[1-9]\d{7,14}$/);assert.equal(createHash('sha256').update(recipient).digest('hex'),process.env.CONTROLLED_TEST_RECIPIENT_SHA256,'Recipient must match the private allowlist');const testId=randomUUID();
 const catalog=JSON.parse(readFileSync(process.env.OWNER_E2E_CATALOG||'','utf8'));
 const url=new URL(process.env.OWNER_E2E_DATABASE_URL||'');
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55439');assert.equal(url.username,'whatsapp_qa');assert.equal(url.pathname,'/notifications_fullstage');
 assert.equal(config.workspace,'notifications-fullstage');
 for(const role of ['nac','crm']){const origin=new URL(config[role].origin);assert.equal(origin.hostname,'127.0.0.1');assert.equal(origin.protocol,'http:')}
 for(const key of ['META_WHATSAPP_ACCESS_TOKEN','SMS_API_KEY'])assert.ok(!process.env[key]);
 const matches=catalog.templates.filter((t:{name:string;language:string})=>t.name==='nac_booking_confirmation_v1'&&t.language==='en_GB');assert.equal(matches.length,1);const providerTemplate=matches[0];
 assert.equal(providerTemplate.status,'APPROVED');assert.equal(providerTemplate.category,'UTILITY');assert.equal(providerTemplate.components.length,1);assert.equal(providerTemplate.components[0].type,'BODY');
 assert.equal(catalog.waba_id,'4556038757974595');assert.equal(catalog.read_only,true);assert.ok(Date.now()-Date.parse(catalog.checked_at)<3600000,'Refresh the read-only approved template snapshot');
 const fingerprint=createHash('sha256').update(stable(providerTemplate)).digest('hex');
 async function post<T=Record<string,unknown>>(origin:string,path:string,input:unknown){const body=JSON.stringify(input),response=await fetch(new URL(path,origin),{method:'POST',headers:{'Content-Type':'application/json',...signedHeaders('POST',path,body,config.nac.keyId,config.nac.secret)},body,redirect:'error',signal:AbortSignal.timeout(30000)});const data=await response.json() as T & {error?:string};assert.equal(response.status,200,String(data.error||'ROUTE_FAILED'));return data}
 await post(config.nac.origin,'/api/internal/notifications/v2/staging-control',{action:'bootstrap'});
 const db=new Pool({connectionString:url.href,max:2}),bookingId='SYNTHETIC-BC-'+testId,bookingPk=randomUUID(),customerId='SYNTHETIC-BC-CUSTOMER-'+testId;let conversationId='SYNTHETIC-BC-CONVERSATION-'+testId;
 try{
  assert.equal((await db.query('SELECT current_database() AS name,current_user AS role')).rows[0].name,'notifications_fullstage');
  assert.equal((await db.query('SELECT 1 FROM "Booking" WHERE "externalId"=$1',[bookingId])).rowCount,0,'Synthetic booking already exists; do not mutate/replay automatically');
  const scope='notifications-fullstage:META:99999999999:99999999998';
  const rule={...sampleRule(),id:'controlled-bc-'+testId.slice(0,12),name:'Controlled Booking confirmed trigger (isolated simulation)',freeText:providerTemplate.components[0].text,template:{id:providerTemplate.id,name:providerTemplate.name,language:providerTemplate.language,fingerprint},bodyMappings:[{variable:'1',source:'booking_id' as const}]};
  const saved=await saveRule(db,rule,'save',0),active=await saveRule(db,saved,'activate',saved.version); // Isolated simulation rule, never a live activation.
  const catalogEntry={...active.template,status:'APPROVED',category:'UTILITY',format:'POSITIONAL',text:providerTemplate.components[0].text,buttons:[],hasHeader:false,providerTemplate,providerFingerprint:fingerprint};
  const occurredAt=new Date(Date.now()-1000).toISOString();
  const c=await db.connect();try{await c.query('BEGIN');
   await c.query('INSERT INTO notification_stage_template(id,definition) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET definition=excluded.definition',[providerTemplate.id,JSON.stringify(catalogEntry)]);
   await c.query(`INSERT INTO "Booking"(id,"externalId","customerName","telephoneNumber","normalCustomerId","pickupDueTime","bookedAtTime","bookingSource") VALUES($1,$2,'Synthetic Owner Test',$3,$4,'2026-11-05T14:00:00Z',$5,'Telephone')`,[bookingPk,bookingId,recipient,customerId,occurredAt]);
   await c.query(`INSERT INTO "BookingLocation"(id,"bookingId",type,address) VALUES($1,$2,'PICKUP','Synthetic pickup, Derriford Hospital'),($3,$2,'DESTINATION','Synthetic destination, Plymouth Station')`,[randomUUID(),bookingPk,randomUUID()]);
   await c.query(`INSERT INTO "WhatsAppConversation"(id,scope,participant) VALUES($1,$2,$3) ON CONFLICT(scope,participant) DO NOTHING`,[conversationId,scope,recipient]);conversationId=(await c.query('SELECT id FROM \"WhatsAppConversation\" WHERE scope=$1 AND participant=$2',[scope,recipient])).rows[0].id;
   await c.query(`INSERT INTO "WhatsAppRecipientGrant"(scope,recipient,"customerId","serviceAllowed",suppressed,"verifiedAt","validUntil","proofType","proofReference","updatedBy") VALUES($1,$2,$3,true,false,now(),now()+interval '15 minutes','OPERATOR_VERIFIED','SYNTHETIC_SIMULATION_ONLY_NOT_LIVE_CONSENT','local-e2e-preparation') ON CONFLICT(scope,recipient) DO UPDATE SET \"customerId\"=excluded.\"customerId\",\"verifiedAt\"=now(),\"validUntil\"=excluded.\"validUntil\"`,[scope,recipient,customerId]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  const decision=await post<ResultV2>(config.nac.origin,'/api/internal/notifications/v2/booking-event',{booking_id:bookingId,rule_id:active.id,revision:1,occurred_at:occurredAt});
  assert.equal(decision.reason,'PREVIEW_READY');assert.equal(decision.content_mode,'template');assert.equal(decision.provider_called,false);
  const history=await post<SharedHistory>(config.nac.origin,'/api/internal/notifications/v2/staging-control',{action:'history',booking_id:bookingId});
  assert.equal(history.messages.length,1);assert.equal(history.notification_decisions.length,1);assert.equal(history.shared_events.length,1);assert.equal(history.real_queued_intents,0);
  const message=history.messages[0];assert.equal(message.status,'SIMULATED');assert.equal((message.content.provider_payload as {to:string}).to,recipient.slice(1));assert.equal(decision.rendered_text,providerTemplate.components[0].text.replace(/\{\{1\}\}/g,bookingId));
  const stored=(await db.query('SELECT request_id,intent FROM notification_stage_intent WHERE operation_key=$1',[decision.idempotency_key])).rows[0];assert.ok(stored);assert.ok(decision.idempotency_key.includes(bookingId));assert.ok(!decision.idempotency_key.startsWith('owner-transport-v1:'));
  const distinctKeys=(await db.query('SELECT count(*) AS n FROM notification_stage_delivery WHERE operation_key=$1',[decision.idempotency_key])).rows[0];assert.equal(Number(distinctKeys.n),1);
  const crmSource=process.env.TAXICRM_CHECKOUT;assert.ok(crmSource,'Select the reviewed TaxiCRM checkout');
  const {prepareControlledBookingConfirmed}=await import(pathToFileURL(resolve(crmSource,'src/lib/integrations/whatsapp/controlled-booking-confirmed.ts')).href);
  const {fullGatewayState}=await import(pathToFileURL(resolve(crmSource,'src/lib/integrations/whatsapp/notifications-full-stage.ts')).href);
  const reader=await db.connect();let gatewayState;try{gatewayState=await fullGatewayState(reader,scope,stored.intent)}finally{reader.release()}
  const approvalManifest=prepareControlledBookingConfirmed({testId,intent:stored.intent,decision,state:gatewayState,template:providerTemplate,templateFingerprint:fingerprint},{workspace:config.workspace,recipient});assert.equal(approvalManifest.execution_enabled,false);
  const duplicate=await post<ResultV2 & {reused?:boolean}>(config.nac.origin,'/api/internal/notifications/v2/booking-event',{booking_id:bookingId,rule_id:active.id,revision:1,occurred_at:occurredAt});assert.equal(duplicate.reused,true);
  assert.equal((await post<SharedHistory>(config.nac.origin,'/api/internal/notifications/v2/staging-control',{action:'history',booking_id:bookingId})).messages.length,1);
  async function blockedProbe(reason:string){const probeId='SYNTHETIC-BC-'+randomUUID(),at=new Date(Date.now()-1000).toISOString();await db.query(`INSERT INTO "Booking"(id,"externalId","customerName","telephoneNumber","normalCustomerId","pickupDueTime","bookedAtTime","bookingSource") VALUES($1,$2,'Synthetic guard probe',$3,$4,'2026-11-05T14:00:00Z',$5,'Telephone')`,[randomUUID(),probeId,recipient,customerId,at]);const result=await post<ResultV2>(config.nac.origin,'/api/internal/notifications/v2/booking-event',{booking_id:probeId,rule_id:active.id,revision:1,occurred_at:at});assert.equal(result.reason,reason);assert.equal(result.provider_called,false);const h=await post<SharedHistory>(config.nac.origin,'/api/internal/notifications/v2/staging-control',{action:'history',booking_id:probeId});assert.equal(h.messages.length,0);return {booking_id:probeId,reason:result.reason,common_messages:0,provider_called:false}}
  await db.query('UPDATE "WhatsAppRecipientGrant" SET suppressed=true WHERE scope=$1 AND recipient=$2',[scope,recipient]);let suppressed;try{suppressed=await blockedProbe('RECIPIENT_SUPPRESSED')}finally{await db.query('UPDATE "WhatsAppRecipientGrant" SET suppressed=false WHERE scope=$1 AND recipient=$2',[scope,recipient])}
  await db.query(`UPDATE "WhatsAppConversation" SET mode='OPERATOR',revision=revision+1 WHERE id=$1 AND scope=$2`,[conversationId,scope]);let operator;try{operator=await blockedProbe('OPERATOR_TAKEOVER')}finally{await db.query(`UPDATE "WhatsAppConversation" SET mode='AUTOMATED',revision=revision+1 WHERE id=$1 AND scope=$2`,[conversationId,scope])}
  const guards={duplicate_reused:duplicate.reused,duplicate_common_messages:1,suppressed,operator};
  const report={state:'PREPARED_NOT_SENT',test_id:testId,guards,approval_manifest:approvalManifest,request_id:stored.request_id,operation_key:decision.idempotency_key,application_intent:stored.intent,previous_test:'CLOSED_READ_NOT_REUSED',recipient_allowlist_sha256:process.env.CONTROLLED_TEST_RECIPIENT_SHA256,maximum_provider_posts:1,automatic_retries:0,sms_fallback:false,live_execution_ready:false,test:'Booking confirmed through full Next NAC → single TaxiCRM simulated gateway → common history',recipient:recipient,booking_id:bookingId,scope,rule:active,meta_catalog_read_at:catalog.checked_at,live_template:providerTemplate,mapping:[{variable:'1',source:'booking_id',canonical:'Booking.externalId',value:bookingId}],decision,exact_payload:message.content.provider_payload,exact_payload_sha256:createHash('sha256').update(JSON.stringify(message.content.provider_payload)).digest('hex'),shared_history:history,real_provider_posts:0,real_booking_mutations:0,live_flags_changed:false,simulation_permission:'Synthetic fixture only; live suppression/permission must be read again before an approved send',execution_limit:'This is a new trigger preparation, not the completed owner-transport-v1 test. A separately reviewed live app-to-gateway handoff and runtime preflight are required; do not invoke or reauthorize the old runner packet.'};
  writeFileSync(process.env.CONTROLLED_TEST_REPORT||'/tmp/controlled-booking-confirmed.private.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({passed:true,booking_id:bookingId,ruleVersion:active.version,reason:decision.reason,contentMode:decision.content_mode,canonical_decisions:history.notification_decisions.length,common_messages:history.messages.length,common_status:message.status,new_test_id:testId,new_operation_key:true,previous_test_reused:false,real_provider_posts:0,real_booking_mutations:0}));
 }finally{await db.end()}
}
void main();
