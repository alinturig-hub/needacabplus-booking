import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {database} from '../../database';
import {canonicalNotificationBooking} from '../canonical';
import {ruleSchema,type Context} from '../model';
import {previewIntent} from '../v2/producer';
import {evaluateContext} from '../v2/context';
import {parseIntent,stable} from '../v2/contract';
import {normalizeJourneyPhone,journeyEvidence} from '../../whatsapp-journey';
import {boundedBody,verifyService,signedHeaders} from '../../whatsapp-service-auth';
import {controlledGuard,controlledBooking,controlledRecipientHash,controlledOrigin,controlledPaths,checkControlledIntent,digest,type ControlledResult} from './protocol';
async function authenticate(request:Request,identity:'NAC'|'CRM'){
 const g=controlledGuard(),body=await boundedBody(request);await verifyService(request,body,process.env['WHATSAPP_'+identity+'_KEY_ID']||'',process.env['WHATSAPP_'+identity+'_SECRET']||'',async id=>!!(await database().query('INSERT INTO whatsapp_service_nonce(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[id])).rowCount);return {g,input:JSON.parse(body)};
}
async function canonical(g=controlledGuard()){
 const db=database(),rule=ruleSchema.parse((await db.query('SELECT definition FROM notification_rules WHERE id=$1',[process.env.CONTROLLED_BC_RULE_ID])).rows[0]?.definition);
 if(rule.event!=='booking.confirmed'||rule.status!=='active'||String(rule.version)!==process.env.CONTROLLED_BC_RULE_VERSION)throw Error('CONTROLLED_RULE_MISMATCH');
 const template=JSON.parse(await readFile(process.env.CONTROLLED_BC_TEMPLATE_FILE||'','utf8'));
 if(template.name!=='nac_booking_confirmation_v1'||template.language!=='en_GB'||template.status!=='APPROVED'||template.category!=='UTILITY'||template.components?.length!==1||template.components[0].type!=='BODY'||digest(template)!==rule.template.fingerprint)throw Error('CONTROLLED_TEMPLATE_MISMATCH');
 const booking=await canonicalNotificationBooking(g.booking,'booking.confirmed');if(!booking)throw Error('CONTROLLED_BOOKING_MISSING');
 const row=(await db.query('SELECT * FROM "Booking" WHERE provider=\'AUTOCAB\' AND "externalId"=$1',[g.booking])).rows[0];if(!row||normalizeJourneyPhone(row.telephoneNumber)!==g.recipient||!row.bookedAtTime)throw Error('CONTROLLED_RECIPIENT_MISMATCH');
 const occurredAt=new Date(row.bookedAtTime).toISOString();const context:Context={synthetic:true,now:new Date().toISOString(),event:{bookingId:booking.id,type:'booking.confirmed',revision:1,occurredAt},booking,recipient:{verified:false,servicePermission:false,suppressed:false},conversation:{id:'unresolved',operator:false,lastEligibleInboundAt:null},provider:{outcome:'NONE',definitivelyUnavailable:false},seen:false,highestRevision:booking.revision,template:{...rule.template,status:template.status,category:template.category,text:template.components[0].text,format:'POSITIONAL',buttons:[],hasHeader:false},capabilities:{parameterSources:[],freeText:false,named:false,dynamicButtons:false,media:false,sms:false}};
 if(!booking.cancelled&&!journeyEvidence(row,'booking.confirmed'))context.highestRevision=2;
 return {rule,context,canonicalRecipient:g.recipient};
}
export async function controlledContextPOST(request:Request){try{
 const {g,input}=await authenticate(request,'CRM'),intent=parseIntent(input.intent,g.workspace);checkControlledIntent(intent);
 const row=(await database().query('SELECT intent,scope,request,fence::text FROM notification_controlled_events WHERE operation_key=$1',[intent.idempotency_key])).rows[0];if(!row||row.scope!==g.scope||row.request.mode!==g.mode||stable(row.intent)!==stable(intent))throw Error('CONTROLLED_EVENT_CONFLICT');
 const decision=await evaluateContext(input,g.workspace,async()=>canonical());
 const after=(await database().query('SELECT fence::text FROM notification_controlled_events WHERE operation_key=$1',[intent.idempotency_key])).rows[0];if(row.fence!==after.fence)throw Error('CONTROLLED_SNAPSHOT_CONFLICT');
 return Response.json({decision,revision:after.fence,mode:g.mode,scope:g.scope},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return controlledError(e)}}
export async function controlledEventPOST(request:Request){try{
 const {g,input}=await authenticate(request,'NAC');if(input.booking_id!==g.booking||Object.keys(input).some(k=>k!=='booking_id'))throw Error('CONTROLLED_EVENT_REJECTED');
 const loaded=await canonical(),intent=previewIntent(loaded.rule,loaded.context,g.workspace,g.recipient);checkControlledIntent(intent);
 const db=database(),id=randomUUID(),saved=await db.query(`INSERT INTO notification_controlled_events(operation_key,request_id,scope,intent,request,status) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,'SENDING') ON CONFLICT DO NOTHING RETURNING request_id`,[intent.idempotency_key,id,g.scope,JSON.stringify(intent),JSON.stringify({occurred_at:intent.occurred_at,revision:1,mode:g.mode})]);
 if(!saved.rowCount){const old=(await db.query('SELECT intent,result,scope,request FROM notification_controlled_events WHERE operation_key=$1',[intent.idempotency_key])).rows[0];if(old.scope!==g.scope||old.request.mode!==g.mode||stable(old.intent)!==stable(intent))throw Error('CONTROLLED_EVENT_CONFLICT');return Response.json(old.result||{mode:g.mode,operation_key:intent.idempotency_key,status:'UNKNOWN',reason:'REQUEST_ALREADY_INITIATED_NO_RETRY',provider_posts:g.mode==='LIVE'?null:0,simulated_posts:g.mode==='SIMULATED'?null:0,booking_id:intent.booking_id,scope:g.scope});}
 const origin=controlledOrigin(process.env.WHATSAPP_GATEWAY_ORIGIN,g.mode),path=controlledPaths.gateway,body=JSON.stringify({schema_version:'controlled-bc/1',mode:g.mode,intent});
 let result:ControlledResult;try{const response=await fetch(new URL(path,origin),{method:'POST',headers:{'Content-Type':'application/json',...signedHeaders('POST',path,body,process.env.WHATSAPP_NAC_KEY_ID||'',process.env.WHATSAPP_NAC_SECRET||'')},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('GATEWAY_RESPONSE_UNAVAILABLE');const text=await boundedBody(response as unknown as Request);result=JSON.parse(text);if(result.operation_key!==intent.idempotency_key||result.booking_id!==intent.booking_id||result.scope!==g.scope||result.mode!==g.mode)throw Error('GATEWAY_CORRELATION_CONFLICT');}
 catch{result={mode:g.mode,scope:g.scope,operation_key:intent.idempotency_key,booking_id:intent.booking_id,status:'UNKNOWN',reason:'SEND_OUTCOME_UNKNOWN_NO_RETRY',provider_posts:g.mode==='LIVE'?null:0,simulated_posts:g.mode==='SIMULATED'?null:0};}
 await synchronizeControlledResult(db,result);return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return controlledError(e)}}
export function controlledError(e:unknown){const raw=e instanceof Error?e.message:'';const code=/^(CONTROLLED_[A-Z_]+|CANONICAL_[A-Z_]+|INVALID_[A-Z_]+|V2_[A-Z_]+|UNAUTHORIZED|REPLAY|SYNTHETIC_ONLY)$/.test(raw)?raw:'CONTROLLED_UNAVAILABLE';const status=['UNAUTHORIZED','REPLAY'].includes(code)?401:code.includes('CONFLICT')?409:['CONTROLLED_DISABLED','CONTROLLED_UNAVAILABLE'].includes(code)?503:422;return Response.json({error:status===503?'CONTROLLED_DISABLED':code},{status,headers:{'Cache-Control':'no-store'}})}
const ranks:Record<string,number>={SENDING:0,UNKNOWN:0,BLOCKED:0,REJECTED:0,ACCEPTED:1,SENT:2,FAILED:2.5,DELIVERED:3,READ:4};
/** Safe after control mode is disabled/expired: only authenticated gateway events may call this. */
export async function synchronizeControlledResult(db:Pool,r:ControlledResult){
 if(!['SIMULATED','LIVE'].includes(r.mode)||![r.provider_posts,r.simulated_posts].every(n=>(n===null&&r.status==='UNKNOWN')||(typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=1))||(r.provider_posts||0)+(r.simulated_posts||0)>1||r.booking_id!=='autocab:'+controlledBooking||!r.operation_key.startsWith(r.booking_id+':booking.confirmed:')||ranks[r.status]===undefined)throw Error('CONTROLLED_STATUS_REJECTED');
 const c=await db.connect();try{await c.query('BEGIN');const old=(await c.query('SELECT * FROM notification_controlled_events WHERE operation_key=$1 AND scope=$2 FOR UPDATE',[r.operation_key,r.scope])).rows[0];if(!old){await c.query('COMMIT');return;}
 if(old.request.mode!==r.mode)throw Error('CONTROLLED_STATUS_MODE_CONFLICT');const recipient=old.intent.recipient as string;if(digestRecipient(recipient)!==controlledRecipientHash||r.operation_key!==`${r.booking_id}:booking.confirmed:${recipient}:1`)throw Error('CONTROLLED_STATUS_REJECTED');
 if(old.provider_message_id&&r.provider_message_id&&old.provider_message_id!==r.provider_message_id)throw Error('CONTROLLED_STATUS_CORRELATION_CONFLICT');
 if((ranks[old.status]||0)<=ranks[r.status])await c.query('UPDATE notification_controlled_events SET status=$2,result=$3::jsonb,provider_message_id=COALESCE(provider_message_id,$4) WHERE operation_key=$1',[r.operation_key,r.status,JSON.stringify(r),r.provider_message_id||null]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
import {createHash} from 'node:crypto';const digestRecipient=(r:string)=>createHash('sha256').update(r).digest('hex');

/** Read-only activation preparation. Does not reserve an event, claim an operation or call a gateway. */
export async function prepareControlledEventReadOnly(){
 if(process.env.CONTROLLED_BC_MODE==='LIVE')throw Error('PREPARATION_REQUIRES_DISABLED_OR_SIMULATED_MODE');
 const url=new URL(process.env.DATABASE_URL||''),identity={host:url.hostname,port:url.port||'5432',name:decodeURIComponent(url.pathname.slice(1)),role:decodeURIComponent(url.username)};
 const validationEnv={...process.env,CONTROLLED_BC_MODE:process.env.CONTROLLED_BC_MODE==='SIMULATED'?'SIMULATED':'LIVE',CONTROLLED_BC_APPROVAL_SHA256:'0'.repeat(64),CONTROLLED_BC_DATABASE_IDENTITY_SHA256:digest(identity)};
 const g=controlledGuard(validationEnv),loaded=await canonical(g),intent=previewIntent(loaded.rule,loaded.context,g.workspace,g.recipient);checkControlledIntent(intent,validationEnv);
 if(loaded.context.booking.cancelled||loaded.context.highestRevision!==1||Date.parse(intent.occurred_at)>Date.now())throw Error('CONTROLLED_CANONICAL_EVENT_NOT_ELIGIBLE');
 if(loaded.context.booking.source==='webapp'&&loaded.context.booking.appAccountId)throw Error('APP_NOTIFICATION_FLOW_SELECTED');
 const db=database();if((await db.query('SELECT 1 FROM notification_controlled_events WHERE operation_key=$1',[intent.idempotency_key])).rowCount||(await db.query('SELECT 1 FROM \"WhatsAppOutboundMessage\" WHERE \"connectionKey\"=$1 AND \"operationKey\"=$2',[g.scope,intent.idempotency_key])).rowCount||(await db.query('SELECT 1 FROM \"WhatsAppControlledDispatch\" WHERE scope=$1 AND operation_key=$2',[g.scope,intent.idempotency_key])).rowCount)throw Error('CONTROLLED_OPERATION_ALREADY_REGISTERED');
 const gatewayIdentity=g.mode==='SIMULATED'?g.databaseIdentity:JSON.parse(process.env.CONTROLLED_BC_GATEWAY_DATABASE_IDENTITY||'null');if(!gatewayIdentity||typeof gatewayIdentity.role!=='string'||!gatewayIdentity.role||['host','port','name'].some(k=>gatewayIdentity[k]!==g.databaseIdentity[k as 'host'|'port'|'name']))throw Error('CONTROLLED_GATEWAY_DATABASE_IDENTITY_REQUIRED');
 return {purpose:'CONTROLLED_BOOKING_CONFIRMED_TRIGGER',canonicalDatabaseIdentity:g.databaseIdentity,preparation_mode:g.mode,intent,template:JSON.parse(await readFile(process.env.CONTROLLED_BC_TEMPLATE_FILE||'','utf8')),deadline:g.deadline,databaseIdentity:gatewayIdentity,scope:g.scope,read_only:true};
}

/** Read-only status survives trial expiry/disable; existing shared-service authentication is still mandatory. */
export async function controlledStatusGET(request:Request){try{
 if(process.env.WHATSAPP_SHARED_ENABLED!=='true')throw Error('CONTROLLED_DISABLED');
 const body=await boundedBody(request);await verifyService(request,body,process.env.WHATSAPP_NAC_KEY_ID||'',process.env.WHATSAPP_NAC_SECRET||'',async id=>!!(await database().query('INSERT INTO whatsapp_service_nonce(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[id])).rowCount);
 const workspace=process.env.WHATSAPP_WORKSPACE_ID||'',waba=process.env.META_WHATSAPP_WABA_ID||'',phone=process.env.META_WHATSAPP_PHONE_NUMBER_ID||'';if(!/^[a-zA-Z0-9_-]{1,64}$/.test(workspace)||!/^\d{5,32}$/.test(waba)||!/^\d{5,32}$/.test(phone))throw Error('CONTROLLED_SCOPE_REQUIRED');
 const row=(await database().query('SELECT status,result,provider_message_id,created_at FROM notification_controlled_events WHERE scope=$1 AND intent->>\'booking_id\'=$2 ORDER BY created_at DESC LIMIT 1',[workspace+':META:'+waba+':'+phone,'autocab:'+controlledBooking])).rows[0];return Response.json(row||{status:'NOT_REGISTERED'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return controlledError(e)}}
