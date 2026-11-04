import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {signedHeaders} from '../../../lib/whatsapp-service-auth';
import type {ResultV2} from '../../../lib/notifications/v2/contract';
type Identity={keyId:string;secret:string;origin:string};type Config={workspace:string;nac:Identity;crm:Identity;admin?:{email:string;password:string}};
const config=JSON.parse(readFileSync(process.env.NOTIFICATIONS_FULL_STAGE_CONFIG||'','utf8')) as Config;
if(config.workspace!=='notifications-fullstage')throw Error('INVALID_STAGE_TARGET');
const base='/api/internal/notifications/v2/',gateway='/api/internal/whatsapp/v2/';
async function post(target:Identity,path:string,input:unknown,expected=200){const body=JSON.stringify(input);const r=await fetch(new URL(path,target.origin),{method:'POST',headers:{'Content-Type':'application/json',...signedHeaders('POST',path,body,config.nac.keyId,config.nac.secret)},body,redirect:'error',signal:AbortSignal.timeout(30000)});const data=await r.json() as Record<string,unknown>;assert.equal(r.status,expected,`${path}: ${String(data.error||'')}`);return data}
async function seed(event:string,scenario='closed'){return post(config.nac,base+'staging-control',{action:'seed',event,scenario})}
const eventData=(s:Record<string,unknown>)=>Object.fromEntries(['booking_id','rule_id','occurred_at','revision'].map(k=>[k,s[k]]));
const eventCall=async(s:Record<string,unknown>)=>await post(config.nac,base+'booking-event',eventData(s)) as unknown as ResultV2;
const control=(body:unknown)=>post(config.crm,gateway+'staging-control',body);
async function history(s:Record<string,unknown>){return post(config.nac,base+'staging-control',{action:'history',booking_id:s.booking_id})}
async function prepare(event:string,scenario='closed'){const s=await seed(event,scenario);await control({action:'handoff',mode:'AUTOMATED'});await control({action:'delay',ms:0});return s}
async function phase(value:string){for(let i=0;i<60;i++){if((await control({action:'phase'})).phase===value)return;await new Promise(r=>setTimeout(r,40))}throw Error('STAGE_PHASE_NOT_OBSERVED')}
async function lockObserved(){for(let i=0;i<30;i++){const value=Number((await control({action:'locks'})).waiting);if(value>0)return value;await new Promise(r=>setTimeout(r,30))}throw Error('POSTGRES_ADVISORY_CONTENTION_NOT_OBSERVED')}
await post(config.nac,base+'staging-control',{action:'bootstrap'});
assert.equal((await fetch(new URL(base+'booking-event',config.nac.origin),{method:'POST',body:'{}'})).status,401);
assert.equal((await fetch(new URL(gateway+'notification-preview',config.crm.origin),{method:'POST',body:'{}'})).status,401);
assert.equal((await fetch(new URL('/api/admin/notifications',config.nac.origin))).status,403);
const events=process.argv.includes('--confirmed-only')?['booking.confirmed']:process.argv.includes('--driver-only')?['driver.dispatched']:['booking.confirmed','driver.dispatched'];
const report:{event:string;case:string;result:unknown}[]=[];
for(const event of events){
 for(const [scenario,reason] of [['closed','PREVIEW_READY'],['open','PREVIEW_READY'],['app-account','APP_NOTIFICATION_FLOW_SELECTED'],['cancelled','BOOKING_CANCELLED'],['expired','NOTIFICATION_EXPIRED'],['unapproved','TEMPLATE_NOT_APPROVED'],['missing-field','REQUIRED_BOOKING_FIELD_MISSING'],['no-grant','SERVICE_PERMISSION_REQUIRED'],['suppressed','RECIPIENT_SUPPRESSED']]){
  const s=await prepare(event,scenario),d=await eventCall(s);assert.equal(d.reason,reason,`${event}/${scenario}`);assert.equal(d.provider_called,false);assert.equal(d.mode,'DRY_RUN');
  const h=await history(s);assert.equal(h.real_queued_intents,0);const messages=h.messages as {content:{text:string};status:string}[],entries=h.events as unknown[];assert.equal(entries.length,1);assert.equal((h.notification_decisions as unknown[]).length,1);assert.equal((h.shared_events as unknown[]).length,1);assert.equal(messages.length,d.result==='ready'?1:0);
  if(d.result==='ready'){const path='/api/internal/whatsapp/v1/conversations/SYNTHETIC-CONVERSATION/messages';const r=await fetch(new URL(path,config.crm.origin),{headers:signedHeaders('GET',path,'',config.nac.keyId,config.nac.secret),redirect:'error'});assert.equal(r.status,200);const shared=await r.json() as {messages:{content:{booking_id:string;text:string};status:string}[]};assert.ok(shared.messages.some(m=>m.content.booking_id===s.booking_id&&m.status==='SIMULATED'&&m.content.text===d.rendered_text));assert.equal(messages[0].status,'SIMULATED');assert.equal(messages[0].content.text,d.rendered_text);assert.ok(d.rendered_text?.includes('Demo Passenger'));assert.ok(d.rendered_text?.includes(String(s.booking_id)));if(event==='booking.confirmed'){assert.ok(d.rendered_text?.includes('Example pickup'));assert.ok(d.rendered_text?.includes('Example destination'));assert.ok(d.rendered_text?.includes('22:30 GMT'))}else{assert.ok(d.rendered_text?.includes('Demo Driver'));assert.ok(d.rendered_text?.includes('DEMO 001'))}}
  if(scenario==='open')assert.equal(d.content_mode,'text');if(scenario==='closed')assert.equal(d.content_mode,'template');if(scenario==='app-account')assert.equal(d.channel,'app');
  report.push({event,case:scenario,result:{decision:d,shared_history:h}});
 }
 // Concurrent producers: same canonical event has one simulated message and shared decision.
 const duplicate=await prepare(event);const responses=await Promise.all(Array.from({length:12},()=>eventCall(duplicate)));assert.ok(responses.every(r=>r.reason==='PREVIEW_READY'));const dupeHistory=await history(duplicate);assert.equal((dupeHistory.messages as unknown[]).length,1);assert.equal((dupeHistory.events as unknown[]).length,1);report.push({event,case:'12-concurrent-duplicates',result:dupeHistory});
 // Cancellation committed after policy evaluation but before final simulated dispatch fence.
 const cancelled=await prepare(event);await control({action:'delay',ms:2000});const cancelling=eventCall(cancelled);await phase('SIMULATION_PENDING');await post(config.nac,base+'staging-control',{action:'cancel',booking_id:cancelled.booking_id});const cancelResult=await cancelling;assert.equal(cancelResult.reason,'BOOKING_CANCELLED');assert.equal(((await history(cancelled)).messages as unknown[]).length,0);report.push({event,case:'cancel-during-simulation',result:cancelResult});
 // Dispatch owns the real PostgreSQL barrier first; operator acknowledgement waits.
 const dispatchFirst=await prepare(event);await control({action:'delay',ms:2000});const pending=eventCall(dispatchFirst);await phase('SIMULATION_PENDING');const taking=control({action:'handoff',mode:'OPERATOR'});const waiters=await lockObserved();const [sent,operator]=await Promise.all([pending,taking]);assert.equal(sent.reason,'PREVIEW_READY');const previous=await history(dispatchFirst);const message=(previous.messages as {content:unknown}[])[0];assert.ok(message);const next=await seed(event);const blocked=await eventCall(next);assert.equal(blocked.reason,'OPERATOR_TAKEOVER');assert.equal(((await history(next)).messages as unknown[]).length,0);report.push({event,case:'dispatch-first-handoff-waits',result:{waiters,operator,previous:sent,after_ack:blocked}});
 // Operator owns the same PostgreSQL transaction barrier first: dispatch cannot cross it.
 const operatorFirst=await prepare(event);const handoffPending=control({action:'handoff',mode:'OPERATOR',delay_ms:1500});await phase('HANDOFF_LOCKED');const waitingEvent=eventCall(operatorFirst);const advisoryWaiters=await lockObserved();await handoffPending;const operatorBlocked=await waitingEvent;assert.equal(operatorBlocked.reason,'OPERATOR_TAKEOVER');assert.equal(((await history(operatorFirst)).messages as unknown[]).length,0);report.push({event,case:'handoff-first-dispatch-blocks',result:{advisoryWaiters,decision:operatorBlocked}});
 console.log(`${event}: real Next routes, PostgreSQL policy/history and both lock orderings passed.`);
}
const directory=process.env.NOTIFICATIONS_FULL_STAGE_ARTIFACTS||'/tmp/notifications-fullstage-evidence';mkdirSync(directory,{recursive:true});const suffix=events.length===1?events[0].replace('.','-'):'all';writeFileSync(resolve(directory,suffix+'.json'),JSON.stringify({passed:true,routes:'real Next application handlers',database:'isolated PostgreSQL',transport:'SIMULATED',providerCalls:0,checks:report},null,2));
