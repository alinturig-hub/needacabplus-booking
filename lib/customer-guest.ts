import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';

const COOKIE='nac_guest_session';
const MAX_AGE=60*60*24;
function secret(){const value=process.env.ADMIN_SESSION_SECRET;if(!value||value.length<32)throw new Error('Guest access is not configured.');return value}
function sign(id:string){return createHmac('sha256',secret()).update(`guest:${id}`).digest('hex')}
function options(maxAge:number){return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge,expires:new Date(Date.now()+maxAge*1000)}}
export async function startGuestSession(){const id=randomUUID();(await cookies()).set(COOKIE,`${id}.${sign(id)}`,options(MAX_AGE));return id}
export async function clearGuestSession(){(await cookies()).set(COOKIE,'',options(0))}
export async function getGuestSession(){
 const value=(await cookies()).get(COOKIE)?.value;if(!value)return null;
 const [id,signature]=value.split('.');if(!/^[0-9a-f-]{36}$/i.test(id||'')||!signature)return null;
 const actual=Buffer.from(signature,'hex'),expected=Buffer.from(sign(id),'hex');
 return actual.length===expected.length&&timingSafeEqual(actual,expected)?{id:`guest:${id}`} : null;
}
