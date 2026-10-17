import type {z} from 'zod';
import type {smsPolicySchema} from './customer-security-policy';

export class EmailDeliveryError extends Error {}

export async function sendSendGridEmail(settings:z.infer<typeof smsPolicySchema>,secrets:Record<string,string>,to:string,subject:string,message:string){
 if(!settings.sendgridEnabled||!settings.sendgridFromEmail||!secrets.sendgridApiKey)throw new EmailDeliveryError('SendGrid email is not configured.');
 if(!to||!/^\S+@\S+\.\S+$/.test(to))throw new EmailDeliveryError('The customer email address is unavailable.');
 let response:Response;
 try{
  response=await fetch('https://api.sendgrid.com/v3/mail/send',{
   method:'POST',headers:{Authorization:`Bearer ${secrets.sendgridApiKey}`,'Content-Type':'application/json'},
   body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:settings.sendgridFromEmail,name:settings.sendgridFromName},subject,content:[{type:'text/plain',value:message}]}),
   redirect:'error',signal:AbortSignal.timeout(10000),
  });
 }catch{throw new EmailDeliveryError('SendGrid delivery could not be confirmed. Check the recipient before retrying.');}
 if(response.status!==202)throw new EmailDeliveryError('SendGrid rejected the email. Check the sender verification and API key.');
 return {accepted:true,reference:response.headers.get('x-message-id')};
}
