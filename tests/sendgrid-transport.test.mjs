import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendSendGridEmail,EmailDeliveryError} from '../lib/sendgrid-transport.ts';

const settings={sendgridEnabled:true,sendgridFromEmail:'bookings@example.com',sendgridFromName:'Need A Cab Plus'};

test('SendGrid accepts a membership email with text content',async t=>{
 const original=globalThis.fetch;
 t.after(()=>{globalThis.fetch=original});
 globalThis.fetch=async (url,options)=>{
  assert.equal(url,'https://api.sendgrid.com/v3/mail/send');
  assert.equal(options.method,'POST');
  assert.equal(options.headers.Authorization,'Bearer test-key');
  const payload=JSON.parse(options.body);
  assert.equal(payload.personalizations[0].to[0].email,'member@example.com');
  assert.equal(payload.from.email,'bookings@example.com');
  assert.deepEqual(payload.content,[{type:'text/plain',value:'Your payment was received.'}]);
  return new Response(null,{status:202,headers:{'x-message-id':'message-123'}});
 };
 assert.deepEqual(await sendSendGridEmail(settings,{sendgridApiKey:'test-key'},'member@example.com','Payment received','Your payment was received.'),{accepted:true,reference:'message-123'});
});

test('SendGrid refuses unconfigured delivery and rejected requests',async t=>{
 await assert.rejects(sendSendGridEmail({...settings,sendgridEnabled:false},{sendgridApiKey:'test-key'},'member@example.com','Subject','Message'),EmailDeliveryError);
 const original=globalThis.fetch;
 t.after(()=>{globalThis.fetch=original});
 globalThis.fetch=async()=>new Response(null,{status:403});
 await assert.rejects(sendSendGridEmail(settings,{sendgridApiKey:'test-key'},'member@example.com','Subject','Message'),/SendGrid rejected/);
});
