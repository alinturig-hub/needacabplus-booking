import {z} from 'zod';
import {sameOrigin,setAdminSession} from '@/lib/security';
import {adminSecurity,loginChallenge,maskedPhone,sendLoginSms,verifyLoginCode} from '@/lib/admin-mfa';
import {setStaffSession} from '@/lib/staff-auth';

const bodySchema=z.discriminatedUnion('action',[z.object({action:z.literal('sendSms')}),z.object({action:z.literal('verify'),method:z.enum(['totp','sms']),code:z.string().regex(/^\d{6}$/)})]);
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 const parsed=bodySchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:'Enter a six-digit code.'},{status:400});
 if(!await loginChallenge())return Response.json({error:'Verification expired. Sign in again.'},{status:401});
 try{if(parsed.data.action==='sendSms'){await sendLoginSms();const state=await adminSecurity();return Response.json({ok:true,maskedPhone:maskedPhone(state.sms_phone)})}
  const challenge=await loginChallenge();
  if(!await verifyLoginCode(parsed.data.method,parsed.data.code))return Response.json({error:'Incorrect or expired code.'},{status:401});
  if(challenge?.row.staff_id)await setStaffSession(challenge.row.staff_id);else await setAdminSession();return Response.json({ok:true});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Verification unavailable.'},{status:503})}
}
