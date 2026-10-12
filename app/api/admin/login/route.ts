import {z} from 'zod';
import {setAdminSession,validCredentials,sameOrigin} from '@/lib/security';
import {adminSecurity,beginLoginChallenge,hasMfa,maskedPhone,sendLoginSms} from '@/lib/admin-mfa';
import {authLimit} from '@/lib/customer-verification';

const credentials=z.object({email:z.string().email(),password:z.string().min(1).max(200)}).strict();

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 let body;
 try{body=credentials.parse(await request.json())}
 catch{return Response.json({error:'Enter your admin email and password.'},{status:400})}
 try{await authLimit('admin-login:'+((request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim()),10,900)}catch{return Response.json({error:'Too many sign-in attempts. Try again later.'},{status:429})}
 if(!validCredentials(body.email,body.password))return Response.json({error:'Incorrect email or password.'},{status:401});
 const state=await adminSecurity();
 if(hasMfa(state)){await beginLoginChallenge();if(!state.totp_secret_encrypted){try{await sendLoginSms()}catch{return Response.json({error:'SMS verification is temporarily unavailable.'},{status:503})}}return Response.json({mfaRequired:true,totp:Boolean(state.totp_secret_encrypted),sms:Boolean(state.sms_phone),maskedPhone:maskedPhone(state.sms_phone)})}
 await setAdminSession();
 return Response.json({ok:true});
}
