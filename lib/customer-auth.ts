import {createHash,randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {cookies} from 'next/headers';
import {database} from '@/lib/database';

const scrypt=promisify(scryptCallback);
const COOKIE='nac_customer_session';
const SESSION_SECONDS=60*60*24*30;

export type Customer={id:string;email:string;fullName:string;phone:string;stripeCustomerId:string|null};

function cookieDomain(){
 const configured=process.env.CUSTOMER_COOKIE_DOMAIN?.trim();if(configured)return configured;
 try{const hostname=new URL(process.env.APP_ORIGIN||'').hostname;return hostname==='needacabplus.app'||hostname.endsWith('.needacabplus.app')?'.needacabplus.app':undefined}catch{return undefined}
}
function cookieOptions(maxAge:number){const domain=cookieDomain();return{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge,expires:new Date(Date.now()+maxAge*1000),...(domain?{domain}:{})}}
function tokenHash(token:string){return createHash('sha256').update(token).digest('hex')}

export async function hashPassword(password:string){const salt=randomBytes(16);const derived=await scrypt(password,salt,64) as Buffer;return`scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`}
export async function verifyPassword(password:string,stored:string){const [,saltValue,hashValue]=stored.split(':');if(!saltValue||!hashValue)return false;const expected=Buffer.from(hashValue,'base64url');const derived=await scrypt(password,Buffer.from(saltValue,'base64url'),expected.length) as Buffer;return derived.length===expected.length&&timingSafeEqual(derived,expected)}

export async function createCustomer(input:{email:string;password:string;fullName:string;phone:string}){
 const id=randomUUID(),passwordHash=await hashPassword(input.password),email=input.email.trim().toLowerCase();
 await database().query('INSERT INTO customer_accounts (id,email,password_hash,full_name,phone) VALUES ($1,$2,$3,$4,$5)',[id,email,passwordHash,input.fullName.trim(),input.phone.trim()]);
 return{id,email,fullName:input.fullName.trim(),phone:input.phone.trim(),stripeCustomerId:null} satisfies Customer;
}

export async function findCustomerByEmail(email:string){const result=await database().query<{id:string;email:string;password_hash:string;full_name:string;phone:string;stripe_customer_id:string|null}>('SELECT id,email,password_hash,full_name,phone,stripe_customer_id FROM customer_accounts WHERE lower(email)=lower($1)',[email.trim()]);return result.rows[0]||null}

export async function setCustomerSession(customerId:string){
 const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+SESSION_SECONDS*1000);
 await database().query('DELETE FROM customer_sessions WHERE expires_at<=now()');
 await database().query('INSERT INTO customer_sessions (token_hash,customer_id,expires_at) VALUES ($1,$2,$3)',[tokenHash(token),customerId,expiresAt]);
 (await cookies()).set(COOKIE,token,cookieOptions(SESSION_SECONDS));
}

export async function clearCustomerSession(){const store=await cookies(),token=store.get(COOKIE)?.value;if(token)await database().query('DELETE FROM customer_sessions WHERE token_hash=$1',[tokenHash(token)]);store.set(COOKIE,'',cookieOptions(0))}

export async function getCustomer():Promise<Customer|null>{
 const token=(await cookies()).get(COOKIE)?.value;if(!token)return null;
 const result=await database().query<{id:string;email:string;full_name:string;phone:string;stripe_customer_id:string|null}>(`SELECT customer.id,customer.email,customer.full_name,customer.phone,customer.stripe_customer_id FROM customer_sessions session JOIN customer_accounts customer ON customer.id=session.customer_id WHERE session.token_hash=$1 AND session.expires_at>now()`,[tokenHash(token)]);
 const row=result.rows[0];return row?{id:row.id,email:row.email,fullName:row.full_name,phone:row.phone,stripeCustomerId:row.stripe_customer_id}:null;
}
