import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitSmsEndpoint,smsRequestUrl} from '../lib/sms-endpoint.ts';
test('signed SMS URLs separate secrets and reconstruct the original query',()=>{
 const original='https://orionconnect.co.uk/api/endpoint/webhook?endpoint_id=109&signature=test-only';
 const p=splitSmsEndpoint(original);
 assert.equal(p.endpoint,'https://orionconnect.co.uk/api/endpoint/webhook');
 assert.equal(p.endpoint.includes('signature'),false);
 assert.equal(smsRequestUrl(p.endpoint,{endpointQuery:p.query}).toString(),original);
});
test('SMS endpoint rejects insecure URLs and embedded credentials',()=>{
 for(const value of ['http://orionconnect.co.uk/send','https://user:pass@example.com/send','https://127.0.0.1/send','https://10.1.1.1/send','https://example.com/send#fragment'])assert.throws(()=>splitSmsEndpoint(value));
});
