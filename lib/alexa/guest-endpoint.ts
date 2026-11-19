import {SkillRequestSignatureVerifier,TimestampVerifier} from 'ask-sdk-express-adapter';
import {z} from 'zod';
import {boundedBody} from './body';
import {guestConversation,guestReply} from './guest';
const verifier=new SkillRequestSignatureVerifier(),timestamp=new TimestampVerifier(150000);
const app=z.object({applicationId:z.string()});
const envelope=z.object({context:z.object({System:z.object({application:app,user:z.object({userId:z.string().min(10).max(512)})})}),session:z.object({sessionId:z.string().min(10).max(512),application:app.optional()}).optional(),request:z.object({type:z.enum(['LaunchRequest','IntentRequest','SessionEndedRequest']),requestId:z.string().min(10).max(512),timestamp:z.string(),locale:z.literal('en-GB'),intent:z.object({name:z.string().max(80),slots:z.record(z.object({value:z.string().max(160).optional()}).passthrough()).optional()}).optional()})});
const headers={'Cache-Control':'no-store'};
export function guestEndpoint(services:{signature:Pick<SkillRequestSignatureVerifier,'verify'>;time:Pick<TimestampVerifier,'verify'>;conversation:typeof guestConversation}={signature:verifier,time:timestamp,conversation:guestConversation}){
 return async function POST(request:Request){
  if(process.env.ALEXA_SKILL_ENABLED!=='true')return Response.json({error:'Unavailable.'},{status:503,headers});
  let raw:string;
  try{raw=await boundedBody(request,65536);}catch{return Response.json({error:'Invalid request.'},{status:400,headers});}
  // Verify the exact bytes before parsing or using any conversational fields.
  try{await services.signature.verify(raw,{signature:request.headers.get('signature')||'',signaturecertchainurl:request.headers.get('signaturecertchainurl')||''});await services.time.verify(raw);}catch{return Response.json({error:'Invalid Alexa signature or timestamp.'},{status:400,headers});}
  let payload:unknown;try{payload=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON.'},{status:400,headers});}
  const parsed=envelope.safeParse(payload);
  if(!parsed.success)return Response.json({error:'Invalid Alexa request.'},{status:400,headers});
  const event=parsed.data;
  if(!Number.isFinite(Date.parse(event.request.timestamp))||Math.abs(Date.now()-Date.parse(event.request.timestamp))>150000)return Response.json({error:'Expired request.'},{status:400,headers});
  const expected=process.env.ALEXA_SKILL_ID||'amzn1.ask.skill.98ba95c6-7892-4739-8faf-6a26e41cbccd';
  if(event.context.System.application.applicationId!==expected||(event.session?.application&&event.session.application.applicationId!==expected))return Response.json({error:'Wrong skill.'},{status:400,headers});
  if(event.request.type==='SessionEndedRequest')return Response.json({version:'1.0',response:{shouldEndSession:true}},{headers});
  if(!event.session)return Response.json({error:'Missing voice session.'},{status:400,headers});
  try{
   const intent=event.request.intent,field=intent?.name==='ProvideNameIntent'?'Name':intent?.name==='ProvidePhoneIntent'?'Phone':'Address';
   return Response.json(await services.conversation({principal:event.context.System.user.userId,session:event.session.sessionId,requestId:event.request.requestId,type:event.request.type,intent:intent?.name,value:intent?.slots?.[field]?.value}),{headers});
  }catch{return Response.json(guestReply('The taxi service is temporarily unavailable. Please try again later.',true),{headers});}
 };
}
