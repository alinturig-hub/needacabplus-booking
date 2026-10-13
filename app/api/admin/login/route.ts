import {z} from 'zod';
import {setAdminSession,validCredentials,sameOrigin} from '@/lib/security';
import {adminSecurity,beginLoginChallenge,hasMfa,maskedPhone,sendLoginSms} from '@/lib/admin-mfa';
import {authLimit} from '@/lib/customer-verification';
import {verifyPassword} from '@/lib/customer-auth';
import {findStaff,setStaffSession} from '@/lib/staff-auth';
import {ADMIN_EMAIL} from '@/lib/security';

const credentials=z.object({email:z.string().email(),password:z.string().min(1).max(200)}).strict();

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 let body;
 try{body=credentials.parse(await request.json())}
 catch{return Response.json({error:'Enter your admin email and password.'},{status:400})}
 try{await authLimit('admin-login:'+((request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim()),10,900)}catch{return Response.json({error:'Too many sign-in attempts. Try again later.'},{status:429})}
 const primary=body.email.trim().toLowerCase()===ADMIN_EMAIL.toLowerCase();
 const staff=primary?null:await findStaff(body.email);
 if(primary?!validCredentials(body.email,body.password):!staff||!staff.enabled||!await verifyPassword(body.password,staff.password_hash))return Response.json({error:'Incorrect email or password.'},{status:401});
 const host=(request.headers.get('x-forwarded-host')||new URL(request.url).host).split(',')[0].trim().split(':')[0].toLowerCase();
 if(staff?.role==='dispatcher'&&host!=='dispatch.needacabplus.app'&&host!=='localhost')return Response.json({error:'This account can sign in to Dispatch only.'},{status:403});
 const state=await adminSecurity();
 if(hasMfa(state)){await beginLoginChallenge(staff?.id||null);if(!state.totp_secret_encrypted){try{await sendLoginSms()}catch{return Response.json({error:'SMS verification is temporarily unavailable.'},{status:503})}}return Response.json({mfaRequired:true,totp:Boolean(state.totp_secret_encrypted),sms:Boolean(state.sms_phone),maskedPhone:maskedPhone(state.sms_phone)})}
 if(staff)await setStaffSession(staff.id);else await setAdminSession();
 return Response.json({ok:true});
}
