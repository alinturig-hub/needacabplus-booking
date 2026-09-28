import {smsRequestUrl} from './sms-endpoint';
import type {z} from 'zod';
import type {smsPolicySchema} from './customer-security-policy';
export class SmsDeliveryError extends Error {}
export async function sendSmsMessage(p:z.infer<typeof smsPolicySchema>,secrets:Record<string,string>,phone:string,message:string){
 const url=smsRequestUrl(p.endpoint,secrets);
 // Preserve real line breaks; JSON/form encoders handle transport escaping.
 const body:Record<string,string>={[p.phoneField]:phone,[p.messageField]:message.replace(/\r\n?/g,'\n'),...(p.sender?{[p.senderField]:p.sender}:{})};
 const headers:Record<string,string>={};if(secrets.token)headers[p.authHeader]=secrets.token;
 let response:Response;
 try{
  if(p.method==='GET'){for(const [key,value] of Object.entries(body))url.searchParams.set(key,value);response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000)})}
  else{headers['Content-Type']=p.method==='POST_JSON'?'application/json':'application/x-www-form-urlencoded';response=await fetch(url,{method:'POST',headers,body:p.method==='POST_JSON'?JSON.stringify(body):new URLSearchParams(body),redirect:'error',signal:AbortSignal.timeout(10000)})}
 }catch{throw new SmsDeliveryError('The SMS request could not be confirmed. Check the receiving phone before trying again.');}
 if(!response.ok)throw new SmsDeliveryError('The SMS provider rejected the request. Check the saved gateway settings.');
 if(url.hostname==='orionconnect.co.uk'){
  let result: {status?:string};try{result=await response.json()}catch{throw new SmsDeliveryError('Orion returned an unexpected response. Delivery could not be confirmed.')}
  if(result.status!=='success')throw new SmsDeliveryError('Orion did not accept the SMS request. Check the saved endpoint and Orion configuration.');
 }
 return {accepted:true};
}
