import {z} from 'zod';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,validCredentials,ADMIN_EMAIL,setAdminSession} from '@/lib/security';
import {adminSecurity,checkSetupSmsCode,decryptTotp,encryptTotp,maskedPhone,matchingTotpStep,newTotpSecret,sendAdminCode,setupSmsCode} from '@/lib/admin-mfa';
import {authLimit,normalizePhone} from '@/lib/customer-verification';

const action=z.object({action:z.enum(['beginTotp','confirmTotp','beginSms','confirmSms','beginDisableSms','disableTotp','disableSms']),password:z.string().min(1).max(200),phone:z.string().max(40).optional(),code:z.string().regex(/^\d{6}$/).optional()}).strict();
function publicState(row:Awaited<ReturnType<typeof adminSecurity>>){return {totpEnabled:Boolean(row.totp_secret_encrypted),smsEnabled:Boolean(row.sms_phone),maskedPhone:maskedPhone(row.sms_phone),smsPending:Boolean(row.pending_sms_phone),totpPending:Boolean(row.pending_totp_encrypted)}}
export async function GET(){if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});return Response.json(publicState(await adminSecurity()),{headers:{'Cache-Control':'no-store'}})}
export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const parsed=action.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:'Check the security form and try again.'},{status:400});
 const input=parsed.data;if(!validCredentials(ADMIN_EMAIL,input.password))return Response.json({error:'Incorrect administrator password.'},{status:401});
 try{
  await authLimit('admin-security',20,900);
  const db=database(),state=await adminSecurity();
  if(input.action==='beginTotp'){
   if(state.totp_secret_encrypted)return Response.json({error:'Authenticator is already active.'},{status:400});
   const secret=newTotpSecret();await db.query('UPDATE admin_security SET pending_totp_encrypted=$1,updated_at=now() WHERE id=true',[encryptTotp(secret)]);
   return Response.json({...publicState(state),secret,uri:`otpauth://totp/Need%20A%20Cab%20Plus:${encodeURIComponent(ADMIN_EMAIL)}?secret=${secret}&issuer=Need%20A%20Cab%20Plus&algorithm=SHA1&digits=6&period=30`});
  }
  if(input.action==='confirmTotp'){
   if(!state.pending_totp_encrypted||!input.code)return Response.json({error:'Start authenticator setup and enter its code.'},{status:400});
   const step=matchingTotpStep(decryptTotp(state.pending_totp_encrypted),input.code);if(step===null)return Response.json({error:'Incorrect authenticator code.'},{status:400});
   await db.query("UPDATE admin_security SET totp_secret_encrypted=pending_totp_encrypted,pending_totp_encrypted='',last_totp_step=$1,session_version=session_version+1,updated_at=now() WHERE id=true",[step]);await setAdminSession();return Response.json({ok:true});
  }
  if(input.action==='beginSms'){
   if(!input.phone)return Response.json({error:'Enter a mobile number.'},{status:400});
   const phone=normalizePhone(input.phone),{code,hash}=setupSmsCode(phone);await authLimit('admin-sms-setup:'+phone,5,1800);
   await sendAdminCode(phone,code);
   await db.query("UPDATE admin_security SET pending_sms_phone=$1,pending_code_hash=$2,pending_expires_at=now()+make_interval(mins=>5),pending_attempts=0,updated_at=now() WHERE id=true",[phone,hash]);
   return Response.json({ok:true,maskedPhone:maskedPhone(phone)});
  }
  if(input.action==='confirmSms'){
   if(!input.code||!state.pending_sms_phone||!state.pending_expires_at||new Date(state.pending_expires_at).getTime()<=Date.now()||state.pending_attempts>=5)return Response.json({error:'SMS code expired. Send a new code.'},{status:400});
   await db.query('UPDATE admin_security SET pending_attempts=pending_attempts+1 WHERE id=true');
   if(!checkSetupSmsCode(state.pending_sms_phone,input.code,state.pending_code_hash))return Response.json({error:'Incorrect SMS code.'},{status:400});
   await db.query("UPDATE admin_security SET sms_phone=pending_sms_phone,pending_sms_phone='',pending_code_hash='',pending_expires_at=NULL,pending_attempts=0,session_version=session_version+1,updated_at=now() WHERE id=true");await setAdminSession();return Response.json({ok:true});
  }
  if(input.action==='disableTotp'){
   if(!state.totp_secret_encrypted||!input.code)return Response.json({error:'Enter an authenticator code to disable it.'},{status:400});
   const step=matchingTotpStep(decryptTotp(state.totp_secret_encrypted),input.code,Number(state.last_totp_step));if(step===null)return Response.json({error:'Incorrect authenticator code.'},{status:400});
   await db.query("UPDATE admin_security SET totp_secret_encrypted='',pending_totp_encrypted='',last_totp_step=-1,session_version=session_version+1,updated_at=now() WHERE id=true");await setAdminSession();return Response.json({ok:true});
  }
  if(input.action==='beginDisableSms'){
   if(!state.sms_phone)return Response.json({error:'SMS is not active.'},{status:400});
   await authLimit('admin-sms-disable:'+state.sms_phone,5,1800);
   const {code,hash}=setupSmsCode(state.sms_phone);await sendAdminCode(state.sms_phone,code);
   await db.query("UPDATE admin_security SET pending_sms_phone=sms_phone,pending_code_hash=$1,pending_expires_at=now()+make_interval(mins=>5),pending_attempts=0,updated_at=now() WHERE id=true",[hash]);return Response.json({ok:true});
  }
  if(input.action==='disableSms'){
   if(!state.sms_phone)return Response.json({error:'SMS is not active.'},{status:400});
   if(!input.code)return Response.json({error:'Enter a verification code.'},{status:400});
   const appStep=state.totp_secret_encrypted?matchingTotpStep(decryptTotp(state.totp_secret_encrypted),input.code,Number(state.last_totp_step)):null;
   const smsValid=state.pending_sms_phone===state.sms_phone&&state.pending_expires_at&&new Date(state.pending_expires_at).getTime()>Date.now()&&state.pending_attempts<5&&checkSetupSmsCode(state.sms_phone,input.code,state.pending_code_hash);
   if(appStep===null&&!smsValid){await db.query('UPDATE admin_security SET pending_attempts=pending_attempts+1 WHERE id=true AND pending_sms_phone=sms_phone');return Response.json({error:'Incorrect or expired verification code.'},{status:400})}
   await db.query("UPDATE admin_security SET sms_phone='',pending_sms_phone='',pending_code_hash='',pending_expires_at=NULL,session_version=session_version+1,updated_at=now() WHERE id=true");await setAdminSession();return Response.json({ok:true});
  }
  return Response.json({error:'Unknown action.'},{status:400});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Security settings unavailable.'},{status:503})}
}
