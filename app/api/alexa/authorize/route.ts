import {boundedBody} from '@/lib/alexa/body';
import {getCustomer} from '@/lib/customer-auth';
import {sameOrigin} from '@/lib/security';
import {authorizationInput} from '@/lib/alexa/policy';
import {issueAuthorizationCode} from '@/lib/alexa/oauth';
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 const customer=await getCustomer();if(!customer)return Response.json({error:'Sign in first.'},{status:401});
 try{const raw=await boundedBody(request,8192);if(raw.length>8192)throw Error();const form=new URLSearchParams(raw),input=authorizationInput(form),url=new URL(input.redirect);url.searchParams.set('state',input.state);
  if(form.get('consent')==='allow')url.searchParams.set('code',await issueAuthorizationCode(customer.id,input.redirect,input.codeChallenge));else url.searchParams.set('error','access_denied');
  return Response.redirect(url,303);
 }catch{return Response.json({error:'Invalid Alexa linking request.'},{status:400});}
}
