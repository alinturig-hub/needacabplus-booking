import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';import {execFileSync} from 'node:child_process';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {certificateUrl,checkSignature,confirmationUrl,envelopeSchema,eventSchema,signingText,boundedText,type SnsEnvelope} from '../lib/street-manager/sns';
import {POST} from '../app/api/webhooks/street-manager/route';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const base:SnsEnvelope={Type:'Notification',MessageId:'SYNTHETIC-MESSAGE',TopicArn:'arn:aws:sns:eu-west-2:287813576808:prod-permit-topic',Message:JSON.stringify({event_reference:1,event_type:'WORK_START',event_time:'2026-11-08T10:00:00Z',object_type:'PERMIT',object_reference:'SYNTHETIC-PERMIT',version:1,object_data:{town:'Plymouth',works_location_coordinates:'POINT(248000 55000)'},future_field:true}),Timestamp:'2026-11-08T10:00:00Z',SignatureVersion:'2',Signature:'placeholder',SigningCertURL:'https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-synthetic.pem'};
function signed(input:SnsEnvelope,key=privateKey){return {...input,Signature:sign(input.SignatureVersion==='2'?'RSA-SHA256':'RSA-SHA1',Buffer.from(signingText(input)),key).toString('base64')}}
test('official topics only; optional new event fields remain compatible',()=>{
 assert.equal(envelopeSchema.safeParse({...base,TopicArn:'arn:aws:sns:eu-west-2:999:other'}).success,false);
 assert.equal(eventSchema.parse(JSON.parse(base.Message)).future_field,true);
});
test('signature versions 1/2 and optional Subject are verified; tampering is rejected',()=>{
 for(const version of ['1','2'] as const){const envelope=signed({...base,SignatureVersion:version,Subject:'Synthetic subject'});checkSignature(envelope,publicKey);assert.throws(()=>checkSignature({...envelope,Message:envelope.Message+' '},publicKey));assert.throws(()=>checkSignature({...envelope,TopicArn:'other'},publicKey));}
});
test('certificate SSRF targets, redirects via URL, credentials, ports and queries are rejected',()=>{
 for(const url of ['http://sns.eu-west-2.amazonaws.com/SimpleNotificationService-a.pem','https://sns.eu-west-2.amazonaws.com.evil.test/SimpleNotificationService-a.pem','https://user@sns.eu-west-2.amazonaws.com/SimpleNotificationService-a.pem','https://127.0.0.1/a.pem','https://sns.eu-west-2.amazonaws.com:8443/SimpleNotificationService-a.pem','https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-a.pem?url=evil'])assert.throws(()=>certificateUrl(url));
 assert.equal(certificateUrl(base.SigningCertURL).hostname,'sns.eu-west-2.amazonaws.com');
});
test('confirmation constructed from signed token/topic, never from arbitrary SubscribeURL',()=>{
 const e={...base,Type:'SubscriptionConfirmation' as const,Token:'SYNTHETIC-TOKEN',SubscribeURL:'https://evil.test/steal'};
 const url=confirmationUrl(e);assert.equal(url.origin,'https://sns.eu-west-2.amazonaws.com');assert.equal(url.searchParams.get('Token'),'SYNTHETIC-TOKEN');assert.equal(url.searchParams.get('TopicArn'),base.TopicArn);
});
test('body limit enforced for text/plain SNS deliveries',async()=>{assert.equal(await boundedText(new Response('abc'),3),'abc');await assert.rejects(boundedText(new Response('abcd'),3));});
test('route rejects unsigned messages and never acknowledges valid signed data without durable storage',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'street-manager-test-')),oldFetch=globalThis.fetch,oldDatabase=process.env.DATABASE_URL;
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=synthetic-sns-test'],{stdio:'ignore'});
  const key=readFileSync(join(temp,'key.pem')),cert=readFileSync(join(temp,'cert.pem'),'utf8');let calls=0;
  globalThis.fetch=async(input)=>{calls++;assert.equal(String(input),base.SigningCertURL);return new Response(cert)};process.env.DATABASE_URL='';
  const valid={...base,Signature:sign('RSA-SHA256',Buffer.from(signingText(base)),key).toString('base64')};
  const request=(x:unknown)=>new Request('https://example.test/api/webhooks/street-manager',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(x)});
  assert.equal((await POST(request({...valid,Signature:'bad'}))).status,403);assert.equal((await POST(request(valid))).status,503);assert.equal(calls,1);
  assert.equal((await POST(request({...valid,TopicArn:'not-dft'}))).status,400);
 }finally{globalThis.fetch=oldFetch;if(oldDatabase===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDatabase;rmSync(temp,{recursive:true,force:true})}
});
test('migration and unique keys retain delayed events but deduplicate SNS/event redelivery',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  const sql=readFileSync(join(process.cwd(),'scripts/migrations/20261108_street_manager_inbox.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const insert=`INSERT INTO street_manager_events(topic_arn,message_id,event_reference,event_type,object_type,object_reference,event_time,sns_timestamp,schema_version,event_data) VALUES($1,$2,$3,'WORK_START','PERMIT','SYNTHETIC-PERMIT',$4,$4,1,'{}') ON CONFLICT DO NOTHING`;
  await db.query(insert,[base.TopicArn,'message-new','event-new','2026-11-08T12:00:00Z']);await db.query(insert,[base.TopicArn,'message-new','event-new','2026-11-08T12:00:00Z']);await db.query(insert,[base.TopicArn,'message-replayed','event-new','2026-11-08T12:00:00Z']);await db.query(insert,[base.TopicArn,'message-old','event-old','2026-11-08T10:00:00Z']);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM street_manager_events')).rows[0].count,2);
  assert.equal((await db.query<{message_id:string}>('SELECT message_id FROM street_manager_events ORDER BY event_time DESC LIMIT 1')).rows[0].message_id,'message-new');
 }finally{await db.close()}
});
