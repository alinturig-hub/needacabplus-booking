import {verifyIdentityToken} from './oauth-token';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRemoteJWKSet,SignJWT,importPKCS8} from 'jose';
import {cookies} from 'next/headers';
import {database} from './database';
import {loadIdentityPolicy,readConfiguration} from './app-configuration';
import {decryptCredentials} from './credentials';
import {hashPassword,findCustomerByEmail} from './customer-auth';
import {AuthError,hash,beginChallenge,completeLogin} from './customer-verification';
const origin=process.env.CUSTOMER_APP_ORIGIN||'https://webapp.needacabplus.app';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleKeys=createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
export function providerName(value:string){if(value!=='google'&&value!=='apple')throw new AuthError('Unknown sign-in provider.');return value}
async function config(provider:'google'|'apple'){const p=await loadIdentityPolicy(),row=await readConfiguration('identity');if(!p[provider==='google'?'googleEnabled':'appleEnabled'])throw new AuthError('This sign-in method is not enabled.');return {p,secrets:row.secrets_encrypted?decryptCredentials(row.secrets_encrypted):{}}}
function redirectUri(provider:string){return origin+'/api/customer/auth/oauth/'+provider+'/callback'}
export async function startOAuth(provider:'google'|'apple'){
 const {p}=await config(provider),state=randomBytes(32).toString('base64url'),browser=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 await database().query('INSERT INTO customer_oauth_states(state_hash,provider,browser_hash,nonce,verifier,expires_at) VALUES($1,$2,$3,$4,$5,now()+make_interval(mins=>5))',[hash(state),provider,hash(browser),nonce,verifier]);
 (await cookies()).set('nac_oauth_'+provider,browser,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:provider==='apple'?'none':'lax',path:'/',maxAge:300});
 const url=new URL(provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://appleid.apple.com/auth/authorize');const params:Record<string,string>={client_id:provider==='google'?p.googleClientId:p.appleClientId,redirect_uri:redirectUri(provider),response_type:'code',scope:provider==='google'?'openid email profile':'name email',state,nonce};
 if(provider==='google'){params.code_challenge=Buffer.from(hash(verifier),'hex').toString('base64url');params.code_challenge_method='S256'}else params.response_mode='form_post';
 Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));return url.toString();
}
export async function finishOAuth(provider:'google'|'apple',code:string,state:string){
 if(!code||code.length>5000||!state||state.length>200)throw new AuthError('Invalid provider response.');
 const browser=(await cookies()).get('nac_oauth_'+provider)?.value;if(!browser)throw new AuthError('Sign-in expired. Please try again.');
 const db=database(),saved=(await db.query('DELETE FROM customer_oauth_states WHERE state_hash=$1 AND provider=$2 AND browser_hash=$3 AND expires_at>now() RETURNING nonce,verifier',[hash(state),provider,hash(browser)])).rows[0];if(!saved)throw new AuthError('Sign-in expired. Please try again.');
 const {p,secrets}=await config(provider),clientId=provider==='google'?p.googleClientId:p.appleClientId;
 let clientSecret=secrets.googleClientSecret;
 if(provider==='apple'){const key=await importPKCS8(secrets.applePrivateKey,'ES256');clientSecret=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:p.appleKeyId}).setIssuer(p.appleTeamId).setAudience('https://appleid.apple.com').setSubject(p.appleClientId).setIssuedAt().setExpirationTime('5m').sign(key)}
 const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri(provider),...(provider==='google'?{code_verifier:saved.verifier}:{})});
 const response=await fetch(provider==='google'?'https://oauth2.googleapis.com/token':'https://appleid.apple.com/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw new AuthError('Provider sign-in could not be completed.');const data=await response.json() as {id_token?:unknown};if(typeof data.id_token!=='string')throw new AuthError('Missing identity token.');
 const payload=await verifyIdentityToken(data.id_token,provider,clientId,saved.nonce,provider==='google'?googleKeys:appleKeys);
 if(payload.nonce!==saved.nonce||!payload.sub)throw new AuthError('Invalid sign-in response.');
 const existing=(await db.query('SELECT c.id,c.phone FROM customer_identities i JOIN customer_accounts c ON c.id=i.customer_id WHERE i.provider=$1 AND i.subject=$2',[provider,payload.sub])).rows[0];
 if(existing)return completeLogin(existing.id,existing.phone);
 if(typeof payload.email!=='string'||!(payload.email_verified===true||payload.email_verified==='true'))throw new AuthError('The provider did not verify an email address.');
 if(await findCustomerByEmail(payload.email))throw new AuthError('This email already has an account. Sign in with your email and password.');
 const fullName=typeof payload.name==='string'?payload.name:'Customer';
 return beginChallenge('social', '',{email:payload.email.toLowerCase(),passwordHash:await hashPassword(randomUUID()+randomUUID()),fullName,provider,subject:payload.sub},null,false);
}
