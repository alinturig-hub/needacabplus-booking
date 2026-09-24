import {createHmac,timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';

export const ADMIN_EMAIL=process.env.ADMIN_EMAIL||'admin@needacabplus.app';
const COOKIE='nac_admin_session';

function secret(){const value=process.env.ADMIN_SESSION_SECRET;if(!value||value.length<32)throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters');return value}
function signature(email:string){return createHmac('sha256',secret()).update(email.toLowerCase()).digest('hex')}
export async function isAdmin(){const value=(await cookies()).get(COOKIE)?.value;if(!value)return false;const expected=signature(ADMIN_EMAIL);const actual=Buffer.from(value,'hex');const target=Buffer.from(expected,'hex');return actual.length===target.length&&timingSafeEqual(actual,target)}
export function validCredentials(email:string,password:string){const configured=process.env.ADMIN_PASSWORD;if(!configured)return false;const emailOk=email.trim().toLowerCase()===ADMIN_EMAIL.toLowerCase();const actual=Buffer.from(password);const target=Buffer.from(configured);return emailOk&&actual.length===target.length&&timingSafeEqual(actual,target)}
export async function setAdminSession(){(await cookies()).set(COOKIE,signature(ADMIN_EMAIL),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*12})}
export async function clearAdminSession(){(await cookies()).set(COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0})}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(!origin)return false;const expected=process.env.APP_ORIGIN;return origin===new URL(request.url).origin||!!expected&&origin===expected}
export function unavailable(error:unknown){console.error('Booking service failure',error);return Response.json({error:'Service temporarily unavailable. Your details have been kept; please try again.'},{status:503})}
