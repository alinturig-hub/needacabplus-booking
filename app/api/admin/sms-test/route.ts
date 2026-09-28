import {z} from 'zod';
import {isAdmin,sameOrigin} from '@/lib/security';
import {loadSmsPolicy} from '@/lib/app-configuration';
import {authLimit,normalizePhone,AuthError} from '@/lib/customer-verification';
import {sendSmsMessage,SmsDeliveryError} from '@/lib/sms-transport';
const schema=z.object({phone:z.string().min(1).max(40),message:z.string().min(1).max(1600).refine(value=>value.trim().length>0,'Enter a message.')}).strict();
export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const data=schema.parse(await request.json()),phone=normalizePhone(data.phone);
  const {settings,secrets}=await loadSmsPolicy();
  if(!settings.enabled||!settings.endpoint)return Response.json({error:'Save and enable the SMS gateway before sending a test.'},{status:400});
  await authLimit('admin-sms-test',10,900);
  await sendSmsMessage(settings,secrets,phone,data.message);
  return Response.json({ok:true,message:'Gateway accepted the test SMS. Check the receiving phone to confirm delivery.'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof AuthError||error instanceof SmsDeliveryError?error.message:'Unable to send the test SMS.'},{status:error instanceof AuthError?error.status:error instanceof SmsDeliveryError?502:400})}
}
