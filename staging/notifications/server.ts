/** Isolated protocol staging service. Never starts Next, workers or production adapters. */
import {createServer} from 'node:http';
import {boundedBody,verifyService} from '../../lib/whatsapp-service-auth';
import {contextHandler} from '../../lib/notifications/v2/http';
import {previewHandler,readNacContext} from './generated-taxicrm/notifications-v2-http';
import {StageStore} from './store';
import {selectionSchema,buildFixture} from './fixtures';
const role=process.env.STAGE_ROLE;
if(process.env.STAGING_NO_SEND!=='true'||!['nac','crm'].includes(role||'')||process.env.STAGE_WORKSPACE!=='notifications-v2-staging')throw Error('INVALID_STAGING_CONFIGURATION');
if(['DATABASE_URL','TAXICRM_DATABASE_URL','TAXICRM_SHARED_DATABASE_URL','META_WHATSAPP_ACCESS_TOKEN','AUTOCAB_API_KEY','SMS_API_KEY'].some(k=>Boolean(process.env[k])))throw Error('PRODUCTION_CONFIGURATION_FORBIDDEN');
const workspace='notifications-v2-staging',key=(prefix:string)=>{const keyId=process.env[prefix+'_KEY_ID']||'',secret=process.env[prefix+'_SECRET']||'';if(!keyId||secret.length<32)throw Error('STAGING_AUTH_REQUIRED');return {keyId,secret}};
const nacKey=key('STAGE_NAC'),crmKey=key('STAGE_CRM'),controlKey=key('STAGE_CONTROL');
const nacOrigin=new URL(process.env.STAGE_NAC_ORIGIN||''),crmOrigin=new URL(process.env.STAGE_CRM_ORIGIN||'');
if([nacOrigin,crmOrigin].some(u=>u.protocol!=='https:'||u.username||u.password)||nacOrigin.origin===crmOrigin.origin)throw Error('STAGING_HTTPS_ORIGINS_REQUIRED');
const store=new StageStore(process.env.STAGE_DATA_DIR||'/stage-data',role!);
const originalFetch=globalThis.fetch;
const guardedFetch:typeof fetch=async(input,init)=>{const u=new URL(String(input));if(u.origin!==nacOrigin.origin||u.pathname!=='/api/internal/notifications/v2/context-preview'||init?.method!=='POST'){store.count('forbidden_egress');throw Error('STAGING_EGRESS_FORBIDDEN')}store.count('context_requests');return originalFetch(input,init)};
// The isolated graph contains no provider transports; all fetches are allow-listed as well.
globalThis.fetch=guardedFetch;
const load=()=>buildFixture(store.selection());
const nacHandler=contextHandler(workspace,{...crmKey,reserve:store.reserve},async()=>{const data=load();if(store.selection().scenario==='cancel-after-intent')data.context.booking.cancelled=true;return {...data,canonicalRecipient:'+447700900001'}});
const crmHandler=previewHandler({...nacKey,reserve:store.reserve},{workspace,now:Date.now,state:async()=>{const {state}=load();return {...state,operator:state.operator||store.operator(),conversation_revision:Number(store.get('revision')||'0')}},context:async(intent,state)=>{const result=await readNacContext(nacOrigin.origin,intent,state,crmKey.keyId,crmKey.secret,guardedFetch);if(store.selection().scenario==='takeover-during-context')store.takeover();return result}});
const server=createServer(async(req,res)=>{
 try{
  if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','X-Robots-Tag':'noindex, nofollow'});res.end(JSON.stringify({service:'notifications-v2-isolated-stage',role,mode:'DRY_RUN',provider_enabled:false}));return}
  const path=role==='nac'?'/api/internal/notifications/v2/context-preview':'/api/internal/whatsapp/v2/notification-preview';
  if(req.method!=='POST'||![path,'/internal/staging/control'].includes(req.url||'')){res.writeHead(404);res.end();return}
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768){res.writeHead(413);res.end();return}chunks.push(Buffer.from(chunk))}
  const request=new Request('https://stage.invalid'+req.url,{method:'POST',headers:req.headers as HeadersInit,body:Buffer.concat(chunks)});
  let response:Response;
  if(req.url==='/internal/staging/control'){
   const raw=await boundedBody(request);await verifyService(request,raw,controlKey.keyId,controlKey.secret,store.reserve);
   const input=JSON.parse(raw) as Record<string,unknown>;
   if(input.action==='select'&&Object.keys(input).every(k=>['action','selection'].includes(k))){const selection=selectionSchema.parse(input.selection);if(Math.abs(Date.now()-Date.parse(selection.fixture_at))>300000)throw Error('INVALID_STAGING_FIXTURE_TIME');store.select(selection)}
   else if(input.action!=='stats'||Object.keys(input).length!==1)throw Error('INVALID_STAGING_CONTROL');
   response=Response.json({role,mode:'DRY_RUN',provider_enabled:false,...store.stats()});
  }else{store.count('protocol_requests');response=await(role==='nac'?nacHandler:crmHandler)(request)}
  res.writeHead(response.status,{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow',...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){const code=e instanceof Error?e.message:'';const status=['UNAUTHORIZED','REPLAY'].includes(code)?401:code.startsWith('INVALID')?422:503;res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:status===401?'UNAUTHORIZED':status===422?'INVALID_STAGING_REQUEST':'STAGING_UNAVAILABLE'}))}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0');
process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0)}));
