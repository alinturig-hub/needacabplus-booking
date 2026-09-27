import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signQuote,verifyQuote} from '../lib/quote-token.ts';
process.env.ADMIN_SESSION_SECRET='local-test-only-quote-signing-secret-32chars';
const quote={id:'test',vehicle:'saloon',service:'priority',scheduledAt:null,pickup:'Public station',destination:'Public library',vias:[],basePence:1000,upliftPence:200,totalPence:1200,percent:20,demand:'high',currency:'GBP',expiresAt:new Date(Date.now()+60000).toISOString()};
test('the amount and route survive signing intact',()=>assert.deepEqual(verifyQuote(signQuote(quote)),quote));
test('quote token conceals the price breakdown and rejects ciphertext tampering',()=>{
 const token=signQuote(quote),parts=token.split('.');
 assert.equal(parts[0],'q2');assert.equal(Buffer.from(parts[3],'base64url').toString().includes('basePence'),false);
 const bytes=Buffer.from(parts[3],'base64url');bytes[0]^=1;parts[3]=bytes.toString('base64url');
 assert.throws(()=>verifyQuote(parts.join('.')),/Invalid quote/);
});
test('changing price or route invalidates a quote',()=>{
 const [,signature]=signQuote(quote).split('.');
 for(const change of [{totalPence:1},{pickup:'Different station'},{service:'guarantee'}]){
  const body=Buffer.from(JSON.stringify({...quote,...change})).toString('base64url');
  assert.throws(()=>verifyQuote(`${body}.${signature}`),/Invalid quote/);
 }
});
test('expired and malformed quotes cannot be confirmed',()=>{
 assert.throws(()=>verifyQuote(signQuote({...quote,expiresAt:new Date(Date.now()-1000).toISOString()})),/expired/);
 for(const token of ['', 'body.bad', 'one.two.three'])assert.throws(()=>verifyQuote(token));
});
