import {createHmac,timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import {adminSecurity} from './admin-mfa';
import {currentStaff} from './staff-auth';

export const ADMIN_EMAIL=process.env.ADMIN_EMAIL||'admin@needacabplus.app';
const COOKIE='nac_admin_session_v3';
const SESSION_SECONDS=60*60*24*30;

function secret(){const value=process.env.ADMIN_SESSION_SECRET;if(!value||value.length<32)throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters');return value}
function signature(email:string,version:number,expires:number){return createHmac('sha256',secret()).update(`${email.toLowerCase()}:${version}:${expires}`).digest('hex')}
function cookieOptions(maxAge:number){return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge,expires:new Date(Date.now()+maxAge*1000)}}
function validSession(value:string|undefined,version:number){if(!value)return false;const [savedVersion,savedExpiry,savedSignature]=value.split('.');const expiry=Number(savedExpiry);if(Number(savedVersion)!==version||!Number.isSafeInteger(expiry)||expiry<=Date.now()||!savedSignature||!/^([a-f0-9]{64})$/.test(savedSignature))return false;const expected=signature(ADMIN_EMAIL,version,expiry);const actual=Buffer.from(savedSignature,'hex');const target=Buffer.from(expected,'hex');return timingSafeEqual(actual,target)}
async function isPrimaryAdmin(){const values=(await cookies()).getAll(COOKIE);if(!values.length)return false;const state=await adminSecurity();return values.some(cookie=>validSession(cookie.value,state.session_version))}
export async function isAdmin(){return await isPrimaryAdmin()||(await currentStaff())?.role==='admin'}
export async function isDispatchUser(){return await isPrimaryAdmin()||Boolean(await currentStaff())}
export function validCredentials(email:string,password:string){const configured=process.env.ADMIN_PASSWORD;if(!configured)return false;const emailOk=email.trim().toLowerCase()===ADMIN_EMAIL.toLowerCase();const actual=Buffer.from(password);const target=Buffer.from(configured);return emailOk&&actual.length===target.length&&timingSafeEqual(actual,target)}
export async function setAdminSession(){const state=await adminSecurity(),expiry=Date.now()+SESSION_SECONDS*1000;(await cookies()).set(COOKIE,`${state.session_version}.${expiry}.${signature(ADMIN_EMAIL,state.session_version,expiry)}`,cookieOptions(SESSION_SECONDS))}
export async function clearAdminSession(){(await cookies()).set(COOKIE,'',cookieOptions(0))}
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');if(!origin)return false;
 const allowed=new Set([new URL(request.url).origin,'https://admin.needacabplus.app','https://drivers.needacabplus.app','https://dispatch.needacabplus.app','https://webapp.needacabplus.app']);
 const expected=process.env.APP_ORIGIN;if(expected)allowed.add(expected);
 const forwardedHost=(request.headers.get('x-forwarded-host')||'').split(',')[0].trim();
 const forwardedProto=(request.headers.get('x-forwarded-proto')||'https').split(',')[0].trim();
 if(forwardedHost)allowed.add(`${forwardedProto}://${forwardedHost}`);
 return allowed.has(origin);
}
export function unavailable(error:unknown){console.error('Booking service failure',error);return Response.json({error:'Service temporarily unavailable. Your details have been kept; please try again.'},{status:503})}
