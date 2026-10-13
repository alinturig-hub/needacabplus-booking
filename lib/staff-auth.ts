import {createHash,randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {database} from './database';

const COOKIE='nac_staff_session';
const SESSION_SECONDS=60*60*24*30;
export type StaffRole='admin'|'dispatcher';
export type StaffAccount={id:string;email:string;full_name:string;role:StaffRole;enabled:boolean};
function tokenHash(value:string){return createHash('sha256').update(value).digest('hex')}
function cookieOptions(maxAge:number){return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge,expires:new Date(Date.now()+maxAge*1000)}}

export async function findStaff(email:string){return (await database().query<StaffAccount&{password_hash:string}>(
 'SELECT id,email,full_name,role,enabled,password_hash FROM staff_accounts WHERE lower(email)=lower($1)',[email.trim()])).rows[0]||null}

export async function currentStaff(){
 const token=(await cookies()).get(COOKIE)?.value;if(!token)return null;
 return (await database().query<StaffAccount>(`SELECT a.id,a.email,a.full_name,a.role,a.enabled FROM staff_sessions s JOIN staff_accounts a ON a.id=s.staff_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.enabled=true`,[tokenHash(token)])).rows[0]||null;
}

export async function setStaffSession(staffId:string){
 const token=randomBytes(32).toString('base64url');
 await database().query('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES($1,$2,now()+make_interval(secs=>$3))',[tokenHash(token),staffId,SESSION_SECONDS]);
 (await cookies()).set(COOKIE,token,cookieOptions(SESSION_SECONDS));
}

export async function clearStaffSession(){
 const store=await cookies(),token=store.get(COOKIE)?.value;
 if(token)await database().query('DELETE FROM staff_sessions WHERE token_hash=$1',[tokenHash(token)]);
 store.set(COOKIE,'',cookieOptions(0));
}
