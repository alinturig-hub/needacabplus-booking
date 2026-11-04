import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeWhatsAppPhone} from '../lib/whatsapp-gateway';
import {signedHeaders,verifyService} from '../lib/whatsapp-service-auth';
test('phone normalization does not invent country for ambiguous numbers',()=>{assert.equal(normalizeWhatsAppPhone('07700 900123'),'+447700900123');assert.equal(normalizeWhatsAppPhone('+40 712 345 678'),'+40712345678');assert.throws(()=>normalizeWhatsAppPhone('712345678'));});
test('NAC accepts signed durable callback authentication and rejects changed endpoint',async()=>{const body='{}',secret='x'.repeat(40),headers=signedHeaders('POST','/api/internal/whatsapp/v1/events',body,'crm-v1',secret);await verifyService(new Request('https://nac.example/api/internal/whatsapp/v1/events',{method:'POST',headers}),body,'crm-v1',secret,async()=>true);await assert.rejects(verifyService(new Request('https://nac.example/api/other',{method:'POST',headers}),body,'crm-v1',secret,async()=>true),/UNAUTHORIZED/);});

import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';import type {Pool} from 'pg';
import {captureConfirmedNotifications,flushNotifications,receiveGatewayEvent} from '../lib/whatsapp-gateway';
test('confirmed booking capture, durable same-key retry, callback dedup and conflict',async()=>{
 const previous={...process.env};Object.assign(process.env,{WHATSAPP_SHARED_ENABLED:'true',WHATSAPP_WORKSPACE_ID:'fleet',WHATSAPP_WABA_ID:'123456',WHATSAPP_PHONE_NUMBER_ID:'789012',WHATSAPP_GATEWAY_ORIGIN:'https://crm.example',WHATSAPP_NAC_KEY_ID:'nac-v1',WHATSAPP_NAC_SECRET:'n'.repeat(40),WHATSAPP_CRM_KEY_ID:'crm-v1',WHATSAPP_CRM_SECRET:'c'.repeat(40)});
 const pg=new PGlite(),db={query:async(sql:string,values?:unknown[])=>{const r=await pg.query(sql,values);return {...r,rowCount:r.affectedRows};}} as unknown as Pool;
 try{
 await pg.exec(readFileSync(new URL('../scripts/migrations/20261104_whatsapp_shared.sql',import.meta.url),'utf8'));
 await pg.exec(`CREATE TABLE web_booking_attempts(quote_id text,state text,external_booking_id text,request_body jsonb,updated_at timestamptz)`);
 const now=new Date();await pg.query(`INSERT INTO web_booking_attempts VALUES('quote','confirmed','100',$1::jsonb,$2),('preview','preview',NULL,$1::jsonb,$2),('unknown','unknown',NULL,$1::jsonb,$2)`,[JSON.stringify({telephoneNumber:'07700 900123'}),now]);
 assert.equal(await captureConfirmedNotifications(db,now),1);assert.equal(await captureConfirmedNotifications(db,now),0);
 let key='';let calls=0;const fetcher=(async(input:unknown,init:RequestInit)=>{calls++;const body=String(init.body),request=new Request(String(input),init);await verifyService(request,body,'nac-v1','n'.repeat(40),async()=>true);const v=JSON.parse(body);if(key)assert.equal(v.idempotency_key,key);key=v.idempotency_key;if(calls===1)throw Error('simulated timeout');return Response.json({id:'gateway-id',status:'HELD'},{status:202});}) as typeof fetch;
 assert.equal(await flushNotifications(db,fetcher),0);await pg.exec(`UPDATE whatsapp_notification_outbox SET next_attempt_at=now()`);assert.equal(await flushNotifications(db,fetcher),1);assert.equal(await flushNotifications(db,fetcher),0);assert.equal(calls,2);
 const event={schema_version:'1.0',event_id:'1',scope:'fleet:META:123456:789012',type:'conversation.mode_changed',payload:{mode:'OPERATOR'}};
 const callback=(payload:unknown)=>{const body=JSON.stringify(payload);return new Request('https://nac.example/api/internal/whatsapp/v1/events',{method:'POST',body,headers:signedHeaders('POST','/api/internal/whatsapp/v1/events',body,'crm-v1','c'.repeat(40))});};
 await receiveGatewayEvent(db,callback(event));await receiveGatewayEvent(db,callback(event));assert.equal((await pg.query(`SELECT * FROM whatsapp_event_inbox`)).rows.length,1);await assert.rejects(receiveGatewayEvent(db,callback({...event,payload:{mode:'AUTOMATED'}})),/EVENT_CONFLICT/);
 }finally{await pg.close();for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});
