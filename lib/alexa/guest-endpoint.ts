import {handleReminderUpdateMessage} from './reminder-update-test';
import {SkillRequestSignatureVerifier,TimestampVerifier} from 'ask-sdk-express-adapter';
import {z} from 'zod';
import {boundedBody} from './body';
import {alexaLocationContextSchema} from './location';
import {saveNotificationConsent,NOTIFICATION_SCOPE} from './notification-consent';
import {guestConversation,guestReply} from './guest';
const verifier=new SkillRequestSignatureVerifier(),timestamp=new TimestampVerifier(150000);
const app=z.object({applicationId:z.string()});
const envelope=z.object({context:z.object({System:z.object({application:app,user:z.object({userId:z.string().min(10).max(512)})})}),session:z.object({sessionId:z.string().min(10).max(512),application:app.optional()}).optional(),request:z.object({type:z.enum(['LaunchRequest','IntentRequest','SessionEndedRequest']),requestId:z.string().min(10).max(512),timestamp:z.string(),locale:z.literal('en-GB'),intent:z.object({name:z.string().max(80),slots:z.record(z.object({value:z.string().max(330).optional()}).passthrough()).optional()}).optional()})});
const headers={'Cache-Control':'no-store'};
export function guestEndpoint(services:{signature:Pick<SkillRequestSignatureVerifier,'verify'>;time:Pick<TimestampVerifier,'verify'>;conversation:typeof guestConversation;consent?:typeof saveNotificationConsent;reminderMessage?:typeof handleReminderUpdateMessage}={signature:verifier,time:timestamp,conversation:guestConversation}){
 return async function POST(request:Request){
  if(process.env.ALEXA_SKILL_ENABLED!=='true')return Response.json({error:'Unavailable.'},{status:503,headers});
  let raw:string;
  try{raw=await boundedBody(request,65536);}catch{return Response.json({error:'Invalid request.'},{status:400,headers});}
  // Verify the exact bytes before parsing or using any conversational fields.
  try{await services.signature.verify(raw,{'signature-256':request.headers.get('signature-256')||'',signaturecertchainurl:request.headers.get('signaturecertchainurl')||''});}catch{return Response.json({error:'Invalid Alexa signature or timestamp.'},{status:400,headers});}
  let payload:unknown;try{payload=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON.'},{status:400,headers});}
  const reminderMessage=z.object({context:z.object({System:z.object({application:app.optional(),user:z.object({userId:z.string().min(10).max(512)}),apiEndpoint:z.string().max(200),apiAccessToken:z.string().min(1).max(16000)})}),request:z.object({type:z.literal('Messaging.MessageReceived'),requestId:z.string().min(10).max(512),timestamp:z.string(),message:z.object({operation:z.literal('REMINDER_UPDATE_TEST'),testId:z.string().regex(/^[a-f0-9]{64}$/),capability:z.string().regex(/^[a-f0-9]{64}$/)}).strict()})}).safeParse(payload);
  if(reminderMessage.success){
   const e=reminderMessage.data,expected=process.env.ALEXA_SKILL_ID||'amzn1.ask.skill.98ba95c6-7892-4739-8faf-6a26e41cbccd',age=Date.now()-Date.parse(e.request.timestamp);
   if((e.context.System.application&&e.context.System.application.applicationId!==expected)||!Number.isFinite(age)||Math.abs(age)>150000)return Response.json({error:'Invalid reminder message.'},{status:400,headers});
   try{const result=await (services.reminderMessage||handleReminderUpdateMessage)({principal:e.context.System.user.userId,apiOrigin:e.context.System.apiEndpoint,apiAccessToken:e.context.System.apiAccessToken,...e.request.message});return Response.json({}, {status:result.state==='forbidden'?403:200,headers});}catch{return Response.json({error:'Reminder update unavailable.'},{status:503,headers});}
  }
  const skillEvent=z.object({context:z.object({System:z.object({application:app,user:z.object({userId:z.string().min(10).max(512)}),apiEndpoint:z.string().optional()})}),request:z.object({type:z.enum(['AlexaSkillEvent.SkillPermissionAccepted','AlexaSkillEvent.SkillPermissionChanged','AlexaSkillEvent.SkillDisabled','AlexaSkillEvent.ProactiveSubscriptionChanged']),requestId:z.string().min(10).max(512),timestamp:z.string(),eventCreationTime:z.string().optional(),body:z.object({acceptedPermissions:z.array(z.object({scope:z.string()})).max(30).optional(),subscriptions:z.array(z.object({eventName:z.string()})).max(30).optional()}).optional()})}).safeParse(payload);
  if(skillEvent.success){
   const e=skillEvent.data,expected=process.env.ALEXA_SKILL_ID||'amzn1.ask.skill.98ba95c6-7892-4739-8faf-6a26e41cbccd',age=Date.now()-Date.parse(e.request.timestamp),at=e.request.eventCreationTime||e.request.timestamp;
   if(e.context.System.application.applicationId!==expected||!Number.isFinite(age)||age< -150000||age>3600000||!Number.isFinite(Date.parse(at))||Date.parse(at)>Date.now()+150000)return Response.json({error:'Invalid skill event.'},{status:400,headers});
   try{await (services.consent||saveNotificationConsent)({userId:e.context.System.user.userId,apiOrigin:e.context.System.apiEndpoint,type:e.request.type,at,scopes:e.request.type==='AlexaSkillEvent.ProactiveSubscriptionChanged'?(e.request.body?.subscriptions?.some(p=>p.eventName==='AMAZON.MessageAlert.Activated')?[NOTIFICATION_SCOPE]:[]):e.request.body?.acceptedPermissions?.map(p=>p.scope)||[]});return Response.json({},{headers});}catch{return Response.json({error:'Permission update unavailable.'},{status:503,headers});}
  }
  try{await services.time.verify(raw);}catch{return Response.json({error:'Invalid Alexa timestamp.'},{status:400,headers});}
  const parsed=envelope.safeParse(payload);
  if(!parsed.success)return Response.json({error:'Invalid Alexa request.'},{status:400,headers});
  const event=parsed.data;
  if(!Number.isFinite(Date.parse(event.request.timestamp))||Math.abs(Date.now()-Date.parse(event.request.timestamp))>150000)return Response.json({error:'Expired request.'},{status:400,headers});
  const expected=process.env.ALEXA_SKILL_ID||'amzn1.ask.skill.98ba95c6-7892-4739-8faf-6a26e41cbccd';
  if(event.context.System.application.applicationId!==expected||(event.session?.application&&event.session.application.applicationId!==expected))return Response.json({error:'Wrong skill.'},{status:400,headers});
  if(event.request.type==='SessionEndedRequest')return Response.json({version:'1.0',response:{shouldEndSession:true}},{headers});
  if(!event.session)return Response.json({error:'Missing voice session.'},{status:400,headers});
  try{
   const location=alexaLocationContextSchema.safeParse((payload as {context:unknown}).context);
   const intent=event.request.intent,field=intent?.name==='QuickPlaceIntent'?'Place':intent?.name==='ProvideNameIntent'?'Name':intent?.name==='ProvidePhoneIntent'?'Phone':'Address';
   return Response.json(await services.conversation({principal:event.context.System.user.userId,session:event.session.sessionId,requestId:event.request.requestId,type:event.request.type,intent:intent?.name,value:intent?.slots?.[field]?.value,journey:intent?.slots?.Journey?.value,...(location.success?{location:location.data}:{})}),{headers});
  }catch{return Response.json(guestReply('The taxi service is temporarily unavailable. Please try again later.',true),{headers});}
 };
}
