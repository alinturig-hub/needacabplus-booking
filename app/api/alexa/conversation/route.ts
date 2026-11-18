import {boundedBody} from '@/lib/alexa/body';
import {alexaConfig} from '@/lib/alexa/policy';
import {alexaCustomer} from '@/lib/alexa/oauth';
import {alexaConversation,conversationInput} from '@/lib/alexa/conversation';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function POST(request:Request){
 try{alexaConfig()}catch{return Response.json({error:'Skill is not configured.'},{status:503,headers});}
 try{
  const customer=await alexaCustomer(request);if(!customer)return Response.json({error:'Account linking required.'},{status:401,headers});
  const raw=await boundedBody(request,4096);if(raw.length>4096)throw Error('INVALID_INPUT');const input=conversationInput.safeParse(JSON.parse(raw));
  if(!input.success)return Response.json({error:'Invalid voice request.'},{status:400,headers});
  return Response.json(await alexaConversation(customer,input.data),{headers});
 }catch{return Response.json({error:'Voice booking is temporarily unavailable. Check the app before trying again.'},{status:503,headers});}
}
