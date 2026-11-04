/** Run only against the two isolated services, using freshly provisioned staging identities. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {signedHeaders} from '../../lib/whatsapp-service-auth';
import {previewIntent} from '../../lib/notifications/v2/producer';
import {buildFixture,type Selection} from './fixtures';
import type {ResultV2} from '../../lib/notifications/v2/contract';
type Identity={keyId:string;secret:string};type Target={uuid:string;origin:string};
type Config={workspace:string;nac:Target&Identity;crm:Target&Identity;control:Identity};
const configPath=process.env.NOTIFICATIONS_STAGE_CONFIG;if(!configPath)throw Error('Select the private staging configuration with NOTIFICATIONS_STAGE_CONFIG');
const config=JSON.parse(readFileSync(configPath,'utf8')) as Config;
if(config.workspace!=='notifications-v2-staging'||config.nac.uuid===config.crm.uuid)throw Error('INVALID_STAGING_TARGETS');
const output=process.env.NOTIFICATIONS_STAGE_ARTIFACTS||'/tmp/notifications-remote-staging';mkdirSync(output,{recursive:true,mode:0o700});
const post=async(target:Target,path:string,payload:unknown,identity:Identity,providedHeaders?:Record<string,string>)=>{const body=JSON.stringify(payload);return fetch(new URL(path,target.origin),{method:'POST',body,headers:providedHeaders||{'Content-Type':'application/json',...signedHeaders('POST',path,body,identity.keyId,identity.secret)},redirect:'error',signal:AbortSignal.timeout(15000)})};
const control=async(target:Target,payload:unknown)=>{const r=await post(target,'/internal/staging/control',payload,config.control);assert.equal(r.status,200);return r.json() as Promise<{instance:string;role:string;mode:string;provider_enabled:boolean;nonces:number;counters:Record<string,number>}>};
for(const [role,target] of [['nac',config.nac],['crm',config.crm]] as const){const r=await fetch(new URL('/health',target.origin),{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const h=await r.json() as {role:string;mode:string;provider_enabled:boolean};assert.equal(h.role,role);assert.equal(h.mode,'DRY_RUN');assert.equal(h.provider_enabled,false)}
if(process.argv.includes('--before-restart')){
 const packets=[];for(const target of [config.nac,config.crm]){const path='/internal/staging/control',payload={action:'stats'},body=JSON.stringify(payload),headers={'Content-Type':'application/json',...signedHeaders('POST',path,body,config.control.keyId,config.control.secret)},r=await post(target,path,payload,config.control,headers);assert.equal(r.status,200);const stats=await r.json() as {instance:string};packets.push({target,payload,headers,instance:stats.instance})}
 writeFileSync(resolve(output,'restart-packets.private.json'),JSON.stringify(packets),{mode:0o600});console.log('Restart checkpoints prepared for both isolated roles.');
}else if(process.argv.includes('--after-restart')){
 const packets=JSON.parse(readFileSync(resolve(output,'restart-packets.private.json'),'utf8')) as {target:Target;payload:unknown;headers:Record<string,string>;instance:string}[];
 for(const p of packets){assert.ok(Date.now()/1000-Number(p.headers['x-wa-timestamp'])<240,'Restart replay proof must still be inside the signature validity window');assert.ok([config.nac.uuid,config.crm.uuid].includes(p.target.uuid));assert.equal((await post(p.target,'/internal/staging/control',p.payload,config.control,p.headers)).status,401);const fresh=await control(p.target,{action:'stats'});assert.equal(fresh.instance,p.instance)}
 writeFileSync(resolve(output,'durable-replay-report.json'),JSON.stringify({passed:true,roles:2,replayRejectedAfterRestart:true,storageInstancePreserved:true,providerCalls:0},null,2));console.log('Both roles rejected replay after restart; durable storage preserved.');
}else{
 const results=[];let calls=0;
 for(const event of ['booking.confirmed','driver.dispatched'] as const){for(const [scenario,variant,reason] of [
 ['other-closed','plain','PREVIEW_READY'],['other-open','plain','PREVIEW_READY'],['app-account','plain','APP_NOTIFICATION_FLOW_SELECTED'],['unknown-outcome','plain','SEND_OUTCOME_UNKNOWN'],['whatsapp-unavailable','plain','SMS_FALLBACK_PREVIEW'],['missing-field','plain','REQUIRED_BOOKING_FIELD_MISSING'],['unapproved-template','plain','TEMPLATE_NOT_APPROVED'],['duplicate','plain','DUPLICATE_EVENT'],['expired','plain','NOTIFICATION_EXPIRED'],['cancelled','plain','BOOKING_CANCELLED'],['out-of-order','plain','STALE_EVENT'],['operator-takeover','plain','OPERATOR_TAKEOVER'],['suppressed','plain','RECIPIENT_SUPPRESSED'],['no-recipient','plain','NO_VERIFIED_RECIPIENT'],['takeover-during-context','plain','OPERATOR_TAKEOVER'],['cancel-after-intent','plain','BOOKING_CANCELLED'],['other-closed','named','PREVIEW_READY'],['other-closed','dynamic','PREVIEW_READY'],['other-closed','missing-link','REQUIRED_BOOKING_FIELD_MISSING'],['other-open','interactive','INTERACTIVE_ADAPTER_UNAVAILABLE'],['other-open','oversized','MESSAGE_LENGTH_EXCEEDED'],['gateway-current','plain','BOOKING_FIELD_ADAPTER_UNAVAILABLE']
 ] as [Selection['scenario'],Selection['variant'],string][]){
  const selection:Selection={event,scenario,variant,fixture_at:new Date().toISOString()};await control(config.nac,{action:'select',selection});await control(config.crm,{action:'select',selection});
  const {rule,context}=buildFixture(selection),intent=previewIntent(rule,context,config.workspace,'+447700900001'),path='/api/internal/whatsapp/v2/notification-preview';
  const body=JSON.stringify(intent),headers={'Content-Type':'application/json',...signedHeaders('POST',path,body,config.nac.keyId,config.nac.secret)},r=await post(config.crm,path,intent,config.nac,headers);assert.equal(r.status,200,`${event}/${scenario}/${variant} HTTP`);
  const d=await r.json() as ResultV2;assert.equal(d.reason,reason,`${event}/${scenario}/${variant}`);assert.equal(d.mode,'DRY_RUN');assert.equal(d.provider_called,false);assert.equal(d.rule.version,rule.version);
  if(variant==='dynamic')assert.equal(d.button_parameters?.[0].value,'https://synthetic.invalid/opaque-staging-token');
  if(scenario==='unknown-outcome')assert.notEqual(d.channel,'sms');if(d.result!=='ready'){assert.equal(d.rendered_text,undefined);assert.equal(d.button_parameters,undefined)}
  if(scenario==='other-open'&&variant==='plain')assert.equal(d.content_mode,'text');if(scenario==='other-closed'&&variant==='plain')assert.equal(d.content_mode,'template');
  assert.equal((await post(config.crm,path,intent,config.nac,headers)).status,401,'CRM replay rejection');
  results.push({event,scenario,variant,reason:d.reason,channel:d.channel,mode:d.content_mode});calls++;
 }}
 const stats={nac:await control(config.nac,{action:'stats'}),crm:await control(config.crm,{action:'stats'})};
 for(const s of Object.values(stats)){assert.equal(s.provider_enabled,false);assert.equal(s.counters.forbidden_egress||0,0)}
 for(const target of [config.nac,config.crm])assert.equal((await fetch(new URL('/api/send',target.origin),{method:'POST',redirect:'error'})).status,404);
 writeFileSync(resolve(output,'remote-staging-report.json'),JSON.stringify({passed:true,mode:'DRY_RUN',transport:'remote HTTPS, certificate verification enabled',targets:{nac:config.nac.origin,crm:config.crm.origin},scenarioCount:calls,providerCalls:0,forbiddenEgress:0,replayRejected:true,stats,results},null,2));console.log(`Remote staging passed: ${calls} scenarios, HTTPS both directions, no provider calls.`);
}
