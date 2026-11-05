/** Synthetic artifact check. Run in an image containing ONLY bundled tools and these test fixtures. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,existsSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {sampleRule} from '../../../lib/notifications/fixtures';
import {saveRule} from '../../../lib/notifications/store';
import {controlledBooking,digest} from '../../../lib/notifications/controlled/protocol';
const exec=promisify(execFile),root=process.env.TOOL_CHECK_ROOT||'/test';
assert.equal(existsSync(root+'/node_modules'),false);
assert.equal(existsSync(root+'/lib'),false);
const databaseName='notifications_controlled_qa_'+randomUUID().replace(/-/g,'');
const owner=new Pool({connectionString:'postgresql://whatsapp_qa@127.0.0.1:55439/postgres',connectionTimeoutMillis:5000});
await owner.query('CREATE DATABASE '+databaseName);await owner.end();
const url='postgresql://whatsapp_qa@127.0.0.1:55439/'+databaseName;
const db=new Pool({connectionString:url});
const recipient='+447713702869';
let httpGets=0,httpPosts=0;
const server=createServer((req,res)=>{if(req.method==='GET')httpGets++;else httpPosts++;assert.ok(req.headers['x-wa-signature']);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'NOT_REGISTERED'}));});
await new Promise<void>(resolve=>server.listen(5521,'127.0.0.1',resolve));
try{
 for(const file of ['schema.sql','shared.sql','controlled.sql','outbound.sql','webhook.sql','dispatch.sql'])await db.query(readFileSync(root+'/fixtures/'+file,'utf8'));
 const template=JSON.parse(readFileSync(root+'/fixtures/template.json','utf8'));
 const rule={...sampleRule(),id:'controlled-tools-test',freeText:template.components[0].text,template:{id:template.id,name:template.name,language:template.language,fingerprint:digest(template)},bodyMappings:[{variable:'1',source:'booking_id' as const}]};
 const draft=await saveRule(db,rule,'save',0);await saveRule(db,draft,'activate',draft.version);
 await db.query(`INSERT INTO "Booking"(id,"externalId","telephoneNumber","normalCustomerId","bookedAtTime","bookingSource") VALUES('qa-booking',$1,$2,'qa-customer',now(),'Telephone')`,[controlledBooking,recipient]);
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:url,TAXICRM_SHARED_DATABASE_URL:url,WHATSAPP_SHARED_ENABLED:'true',WHATSAPP_WORKSPACE_ID:'tools-qa',CONTROLLED_BC_MODE:'SIMULATED',CONTROLLED_BC_BOOKING_ID:controlledBooking,CONTROLLED_BC_RECIPIENT:recipient,CONTROLLED_BC_EXPIRES_AT:new Date(Date.now()+3600000).toISOString(),META_WHATSAPP_SENDING_ENABLED:'false',WHATSAPP_JOURNEY_SENDING_ENABLED:'false',META_WHATSAPP_TEST_SEND_ENABLED:'false',META_WHATSAPP_WABA_ID:'99999999999',META_WHATSAPP_PHONE_NUMBER_ID:'99999999998',CONTROLLED_BC_RULE_ID:rule.id,CONTROLLED_BC_RULE_VERSION:'2',CONTROLLED_BC_TEMPLATE_FILE:root+'/fixtures/template.json',WHATSAPP_NAC_KEY_ID:'qa-nac',WHATSAPP_NAC_SECRET:'synthetic-key-for-bundle-check-0000000000',APP_ORIGIN:'http://127.0.0.1:5521'};
 const run=(file:string,args:string[]=[],changes:Partial<NodeJS.ProcessEnv>={})=>exec(process.execPath,[root+'/'+file,...args],{env:{...env,...changes},cwd:root,timeout:15000});
 for(const directory of ['nac','crm']){
  const manifest=JSON.parse(readFileSync(root+'/'+directory+'/manifest.json','utf8'));
  for(const a of manifest.artifacts)assert.equal(createHash('sha256').update(readFileSync(root+'/'+directory+'/'+a.file)).digest('hex'),a.sha256);
 }
 const inspect=JSON.parse((await run('nac/run-controlled-booking-event.cjs',['--inspect'])).stdout);assert.equal(inspect.execution,false);
 await assert.rejects(run('nac/run-controlled-booking-event.cjs',['--execute']));assert.equal(httpPosts,0);
 await assert.rejects(run('nac/run-controlled-booking-event.cjs',['--inspect'],{CONTROLLED_BC_MODE:'DISABLED'}));
 assert.equal(JSON.parse((await run('nac/run-controlled-booking-event.cjs',['--status'])).stdout).status,'NOT_REGISTERED');assert.equal(httpGets,1);assert.equal(httpPosts,0);
 await assert.rejects(run('nac/prepare-controlled-event.cjs',[root+'/missing.json'],{CONTROLLED_BC_TEMPLATE_FILE:root+'/absent-private-template.json'}),(error:unknown)=>String((error as {stderr?:string}).stderr).includes('(ENOENT)'));
 await run('nac/prepare-controlled-event.cjs',[root+'/descriptor.json']);
 await run('crm/prepare-controlled-approval.cjs',[root+'/descriptor.json',root+'/approval.json']);
 const packet=JSON.parse(readFileSync(root+'/approval.json','utf8'));assert.equal(packet.execution_enabled,false);assert.equal(packet.intent.recipient,recipient);assert.equal(packet.intent.booking_id,'autocab:'+controlledBooking);
 const rows=await db.query(`SELECT (SELECT count(*) FROM notification_controlled_events)::int events,(SELECT count(*) FROM "WhatsAppControlledDispatch")::int dispatches,(SELECT count(*) FROM "WhatsAppOutboundMessage")::int outbounds`);
 assert.deepEqual(rows.rows[0],{events:0,dispatches:0,outbounds:0});
 console.log(JSON.stringify({passed:true,node:process.version,artifacts_verified:3,inspect:true,status:true,read_only_descriptor:true,offline_approval:true,execution_blocked_in_simulation:true,safe_missing_file_error:true,registrations:0,provider_posts:0,http_posts:httpPosts,no_source_or_node_modules:true}));
}finally{await db.end();server.close();}
