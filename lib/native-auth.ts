import {randomBytes,createHash} from 'node:crypto';
import {database} from './database';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const format=/^[A-Za-z0-9_-]{43}$/;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export type NativeContext={challenge:string;state:string};
export function nativeContext(challenge:unknown,state:unknown):NativeContext|null{
 if(challenge===undefined&&state===undefined||challenge===null&&state===null)return null;
 if(typeof challenge!=='string'||typeof state!=='string'||!format.test(challenge)||!format.test(state))throw Error('INVALID_NATIVE_CONTEXT');
 return {challenge,state};
}
export function encodeOAuthVerifier(providerVerifier:string,native:NativeContext|null){return native?JSON.stringify({version:1,providerVerifier,native}):providerVerifier}
export function decodeOAuthVerifier(value:string):{providerVerifier:string;native:NativeContext|null}{
 if(format.test(value))return {providerVerifier:value,native:null};
 const data=JSON.parse(value);if(data?.version!==1||!format.test(data.providerVerifier)||Object.keys(data).some(k=>!['version','providerVerifier','native'].includes(k)))throw Error('INVALID_NATIVE_CONTEXT');
 const native=nativeContext(data.native?.challenge,data.native?.state);if(!native)throw Error('INVALID_NATIVE_CONTEXT');return {providerVerifier:data.providerVerifier,native};
}
/** Separate, versioned provider namespace in the existing ephemeral OAuth state store. */
export async function issueNativeGrant(customerId:string,context:NativeContext,db=database()){
 if(!uuid.test(customerId))throw Error('INVALID_NATIVE_SUBJECT');
 await db.query("DELETE FROM customer_oauth_states WHERE provider='native_google_handoff_v1' AND expires_at<=now()");
 const code=randomBytes(32).toString('base64url');
 await db.query(`INSERT INTO customer_oauth_states(state_hash,provider,browser_hash,nonce,verifier,expires_at) VALUES($1,'native_google_handoff_v1',$2,$3,$4,now()+interval '60 seconds')`,[hash(code),Buffer.from(context.challenge,'base64url').toString('hex'),context.state,JSON.stringify({version:1,customerId})]);
 // Fragment never reaches the web server/access logs. This is NOT a session token.
 return '/mobile-auth/complete#'+new URLSearchParams({code,state:context.state}).toString();
}
export async function consumeNativeGrant(input:unknown,db=database()){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['code','state','verifier'].includes(k)))throw Error('INVALID_NATIVE_GRANT');
 const {code,state,verifier}=input as Record<string,unknown>;if(typeof code!=='string'||typeof state!=='string'||typeof verifier!=='string'||![code,state,verifier].every(v=>format.test(v)))throw Error('INVALID_NATIVE_GRANT');
 const result=await db.query(`DELETE FROM customer_oauth_states WHERE state_hash=$1 AND provider='native_google_handoff_v1' AND browser_hash=$2 AND nonce=$3 AND expires_at>now() RETURNING verifier`,[hash(code),hash(verifier),state]);
 if(!result.rows[0])throw Error('NATIVE_GRANT_EXPIRED_OR_USED');
 const subject=JSON.parse(result.rows[0].verifier);if(subject?.version!==1||typeof subject.customerId!=='string'||!uuid.test(subject.customerId))throw Error('INVALID_NATIVE_SUBJECT');return subject.customerId as string;
}
