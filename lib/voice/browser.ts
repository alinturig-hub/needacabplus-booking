import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '../database';
import {addressAtCoordinates} from '../autocab-api';
import {alexaJourneySchema,autocabSettings} from '../alexa/autocab-quote';
import {guestConversation} from '../alexa/guest';
import {boundedBody} from '../alexa/body';
import {hash} from '../alexa/policy';
import {voiceInput} from './input';
import {issueVoiceSession,readVoiceSession,voiceCookie,VOICE_COOKIE} from './session';
const position=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracy:z.number().nonnegative().max(100),timestamp:z.number().int()}).strict();
const input=z.object({action:z.enum(['start','message','reset']),id:z.string().uuid(),text:z.string().trim().min(1).max(330).optional(),gps:position.optional()}).strict();
const defaults={db:database,conversation:guestConversation,reverse:addressAtCoordinates,now:Date.now};
async function rate(db:ReturnType<typeof database>,key:string,limit=60){
 const c=await db.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='1500ms'");await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);const r=await c.query<{count:number}>("SELECT count(*)::int AS count FROM alexa_guest_requests WHERE principal=$1 AND created_at>now()-interval '1 minute'",[key]);if(Number(r.rows[0].count)>=limit){await c.query('ROLLBACK');return false;}await c.query("INSERT INTO alexa_guest_requests(principal,request_hash,response) VALUES($1,$2,'{}')",[key,randomUUID()]);await c.query('COMMIT');return true;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export function browserVoiceEndpoint(services:Partial<typeof defaults>={}){
 const s={...defaults,...services};return async function POST(request:Request){
  const headers:Record<string,string>={'Cache-Control':'no-store'};
  // Independent origin/cookie boundary: the Alexa signature-verified route is unchanged.
  if(request.headers.get('origin')!=='https://webapp.needacabplus.app'||!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Invalid origin.'},{status:403,headers});
  if(process.env.ALEXA_SKILL_ENABLED!=='true')return Response.json({error:'Voice preview is unavailable.'},{status:503,headers});
  let data:z.infer<typeof input>;
  try{data=input.parse(JSON.parse(await boundedBody(request,4096)));if(data.action==='message'&&!data.text)throw Error();}catch{return Response.json({error:'Invalid voice request.'},{status:400,headers});}
  try{
   const db=s.db(),ip=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,80),rateKey='voice-rate:'+hash(ip);
   if(!await rate(db,rateKey)||!await rate(db,'voice-rate:global',120))return Response.json({error:'Please wait a minute before trying again.'},{status:429,headers});
   const saved=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(VOICE_COOKIE+'='))?.slice(VOICE_COOKIE.length+1);
   let session=readVoiceSession(saved,s.now());
   if(!session&&data.action==='message')return Response.json({error:'Start a new conversation first.'},{status:401,headers});
   if(!session||data.action==='reset'){const issued=issueVoiceSession(session||undefined,s.now());session=issued.value;headers['Set-Cookie']=voiceCookie(issued.cookie);}
   const principal='browser-voice:'+session.principal,sessionId='browser-voice:'+session.session;
   const existing=(await db.query<{phase:string}>('SELECT phase FROM alexa_guest_sessions WHERE principal=$1 AND session_hash=$2',[hash(principal),hash(sessionId)])).rows[0];
   const command=data.action==='message'?voiceInput(data.text!,existing?.phase||'pickup'):{};
   const result=await s.conversation({principal,session:sessionId,requestId:'browser-request:'+data.id,type:data.action==='message'?'IntentRequest':'LaunchRequest',...command},{
    // This new browser channel cannot be activated by changing Alexa's live flag.
    mode:'preview',
    location:async()=>{
     const gps=data.gps;if(!gps||s.now()-gps.timestamp>60000||s.now()-gps.timestamp< -10000)return null;
     const raw=await s.reverse(gps.latitude,gps.longitude,autocabSettings().companyId,true,30),address=alexaJourneySchema.shape.pickup.safeParse(raw);
     return address.success?{address:{...address.data,coordinate:{...address.data.coordinate,latitude:gps.latitude,longitude:gps.longitude}},source:'gps',measuredAt:gps.timestamp,...(typeof address.data.town==='string'?{city:address.data.town}:{})}:null;
    }
   });
   const state=(await db.query<{phase:string}>('SELECT phase FROM alexa_guest_sessions WHERE principal=$1 AND session_hash=$2',[hash(principal),hash(sessionId)])).rows[0]?.phase;
   return Response.json({speech:result.response.outputSpeech.text,ended:result.response.shouldEndSession,field:state==='phone'?'phone':state==='name'?'name':'address'},{headers});
  }catch{return Response.json({error:'Voice preview is temporarily unavailable. Please try again.'},{status:503,headers});}
 };
}
