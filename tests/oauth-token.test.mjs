import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyIdentityToken} from '../lib/oauth-token.ts';
test('Google and Apple tokens require signature, issuer, audience, nonce and expiry',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const token=(overrides={})=>new SignJWT({sub:'subject',nonce:'bound-nonce',email_verified:true,...overrides}).setProtectedHeader({alg:'RS256'}).setIssuedAt().setExpirationTime('5m').setIssuer('https://accounts.google.com').setAudience('client').sign(privateKey);
 const valid=await token();assert.equal((await verifyIdentityToken(valid,'google','client','bound-nonce',async()=>publicKey)).sub,'subject');
 await assert.rejects(verifyIdentityToken(valid,'google','wrong-client','bound-nonce',async()=>publicKey));
 await assert.rejects(verifyIdentityToken(valid,'google','client','wrong-nonce',async()=>publicKey));
 await assert.rejects(verifyIdentityToken(valid,'apple','client','bound-nonce',async()=>publicKey));
 await assert.rejects(verifyIdentityToken(await token({azp:'another-client'}),'google','client','bound-nonce',async()=>publicKey));
 const other=await generateKeyPair('RS256');await assert.rejects(verifyIdentityToken(valid,'google','client','bound-nonce',async()=>other.publicKey));
 const expired=await new SignJWT({sub:'subject',nonce:'bound-nonce'}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience('client').setIssuedAt(1).setExpirationTime(2).sign(privateKey);await assert.rejects(verifyIdentityToken(expired,'google','client','bound-nonce',async()=>publicKey));
 const apple=await new SignJWT({sub:'subject',nonce:'bound-nonce'}).setProtectedHeader({alg:'RS256'}).setIssuer('https://appleid.apple.com').setAudience('client').setIssuedAt().setExpirationTime('5m').sign(privateKey);assert.equal((await verifyIdentityToken(apple,'apple','client','bound-nonce',async()=>publicKey)).sub,'subject');
});
