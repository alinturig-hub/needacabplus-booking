import {z} from 'zod';
import {isAdmin,sameOrigin} from '@/lib/security';
import {loadSmsPolicy} from '@/lib/app-configuration';
import {authLimit,AuthError} from '@/lib/customer-verification';
import {sendSendGridEmail,EmailDeliveryError} from '@/lib/sendgrid-transport';

const schema=z.object({email:z.string().email()}).strict();

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const {email}=schema.parse(await request.json());
  const {settings,secrets}=await loadSmsPolicy();
  await authLimit('admin-sendgrid-test',5,900);
  await sendSendGridEmail(settings,secrets,email,'Need A Cab Plus email test','This is a test email from Need A Cab Plus. Your SendGrid configuration accepted the request.');
  return Response.json({ok:true,message:'SendGrid accepted the email. Check the receiving inbox to confirm delivery.'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof AuthError||error instanceof EmailDeliveryError?error.message:'Unable to send the test email.'},{status:error instanceof AuthError?error.status:error instanceof EmailDeliveryError?502:400});}
}
