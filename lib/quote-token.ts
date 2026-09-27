import {createHmac,timingSafeEqual,createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {FareQuote} from './quotes';
function secret(){const value=process.env.ADMIN_SESSION_SECRET;if(!value||value.length<32)throw new Error('Quote signing is not configured.');return value}
function signature(body:string){return createHmac('sha256',secret()).update(`fare-quote:v1:${body}`).digest('base64url')}
function key(){return createHash('sha256').update(`fare-quote:v2:${secret()}`).digest()}
export function signQuote(quote:FareQuote){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),body=Buffer.concat([cipher.update(JSON.stringify(quote),'utf8'),cipher.final()]);return ['q2',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.')}
export function verifyQuote(token:string):FareQuote{
 if(token.startsWith('q2.')){
  let quote:FareQuote;
  try{const [,iv,tag,body,...rest]=token.split('.');if(rest.length||!iv||!tag||!body)throw new Error();const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));quote=JSON.parse(Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8'))}catch{throw new Error('Invalid quote. Request a new fare.')}
  if(!Number.isFinite(Date.parse(quote.expiresAt))||Date.parse(quote.expiresAt)<=Date.now())throw new Error('This fare has expired. Request a new quote before confirming.');return quote;
 }
 // Existing signed quotes remain valid for their short expiry during deployment.
 const [body,sig,...rest]=token.split('.');if(!body||!sig||rest.length)throw new Error('Invalid quote. Request a new fare.');
 const expected=Buffer.from(signature(body)),actual=Buffer.from(sig);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new Error('Invalid quote. Request a new fare.');
 const quote=JSON.parse(Buffer.from(body,'base64url').toString()) as FareQuote;
 if(Date.parse(quote.expiresAt)<=Date.now())throw new Error('This fare has expired. Request a new quote before confirming.');
 return quote;
}
