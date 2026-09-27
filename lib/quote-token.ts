import {createHmac,timingSafeEqual} from 'node:crypto';
import type {FareQuote} from './quotes';
function secret(){const value=process.env.ADMIN_SESSION_SECRET;if(!value||value.length<32)throw new Error('Quote signing is not configured.');return value}
function signature(body:string){return createHmac('sha256',secret()).update(`fare-quote:v1:${body}`).digest('base64url')}
export function signQuote(quote:FareQuote){const body=Buffer.from(JSON.stringify(quote)).toString('base64url');return `${body}.${signature(body)}`}
export function verifyQuote(token:string):FareQuote{
 const [body,sig,...rest]=token.split('.');if(!body||!sig||rest.length)throw new Error('Invalid quote. Request a new fare.');
 const expected=Buffer.from(signature(body)),actual=Buffer.from(sig);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new Error('Invalid quote. Request a new fare.');
 const quote=JSON.parse(Buffer.from(body,'base64url').toString()) as FareQuote;
 if(Date.parse(quote.expiresAt)<=Date.now())throw new Error('This fare has expired. Request a new quote before confirming.');
 return quote;
}
