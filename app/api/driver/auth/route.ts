import {z} from 'zod';
import {database} from '@/lib/database';
import {hashPassword,verifyPassword} from '@/lib/customer-auth';
import {authLimit,requestAuthLimit,AuthError} from '@/lib/customer-verification';
import {currentDriver,setDriverSession,clearDriverSession,driverTokenHash} from '@/lib/driver-app';
import {sameOrigin,unavailable} from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json({driver:await currentDriver()},{headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 try{await requestAuthLimit(request);const body=z.discriminatedUnion('action',[z.object({action:z.literal('login'),email:z.string().email().max(250),password:z.string().min(1).max(200)}).strict(),z.object({action:z.literal('activate'),token:z.string().min(32).max(200),password:z.string().min(12).max(200)}).strict(),z.object({action:z.literal('logout')}).strict()]).parse(await request.json());
 if(body.action==='logout'){const driver=await currentDriver();if(driver)await database().query('UPDATE driver_app_accounts SET online=false WHERE id=$1',[driver.id]);await clearDriverSession();return Response.json({ok:true})}
 if(body.action==='activate'){
 await authLimit('driver-invite:'+driverTokenHash(body.token),10);
 const password=await hashPassword(body.password);const result=await database().query(`UPDATE driver_app_accounts a SET password_hash=$2,invite_hash=NULL,invite_expires_at=NULL WHERE invite_hash=$1 AND invite_expires_at>now() AND enabled AND EXISTS(SELECT 1 FROM public."Driver" d WHERE d.id=a.driver_id AND d.active AND NOT d.suspended AND NOT d.archived) RETURNING id`,[driverTokenHash(body.token),password]);
 if(!result.rows[0])return Response.json({error:'Invitation is invalid or expired.'},{status:400});await database().query('DELETE FROM driver_app_sessions WHERE account_id=$1',[result.rows[0].id]);await setDriverSession(result.rows[0].id);return Response.json({ok:true});
 }
 await authLimit('driver-login:'+body.email.toLowerCase(),15);
 const row=(await database().query(`SELECT a.id,a.password_hash FROM driver_app_accounts a JOIN public."Driver" d ON d.id=a.driver_id WHERE lower(a.email)=lower($1) AND a.enabled AND d.active AND NOT d.suspended AND NOT d.archived`,[body.email])).rows[0];
 if(!row?.password_hash||!await verifyPassword(body.password,row.password_hash))return Response.json({error:'Email or password is incorrect.'},{status:401});await setDriverSession(row.id);return Response.json({ok:true});
 }catch(e){if(e instanceof AuthError)return Response.json({error:e.message},{status:e.status});if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Check your details. Passwords for activation need at least 12 characters.'},{status:400});return unavailable(e)}
}
