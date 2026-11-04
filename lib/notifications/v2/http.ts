import {boundedBody,verifyService,signedHeaders} from '../../whatsapp-service-auth';
import {evaluateContext,type ContextLoader} from './context';
export type AuthConfig={keyId:string;secret:string;reserve:(nonce:string)=>Promise<boolean>};
export async function authenticateV2(request:Request,auth:AuthConfig){const body=await boundedBody(request);await verifyService(request,body,auth.keyId,auth.secret,auth.reserve);try{return JSON.parse(body)}catch{throw Error('INVALID_V2_JSON')}}
export function v2Error(e:unknown){const code=e instanceof Error?e.message:'UNAVAILABLE';const status=['UNAUTHORIZED','REPLAY'].includes(code)?401:code==='WRONG_SCOPE'?403:code.includes('CONFLICT')?409:code.startsWith('INVALID')||code==='SYNTHETIC_ONLY'?422:code==='BODY_TOO_LARGE'?413:503;return Response.json({error:status===503?'V2_PREVIEW_UNAVAILABLE':code},{status,headers:{'Cache-Control':'no-store'}})}
export function contextHandler(workspace:string,auth:AuthConfig,load:ContextLoader){return async(request:Request)=>{try{return Response.json(await evaluateContext(await authenticateV2(request,auth),workspace,load),{headers:{'Cache-Control':'no-store'}})}catch(e){return v2Error(e)}}}
/** Fixed-path signed caller, bounded response, no retries or redirects. */
export async function callPreview(origin:string,intent:unknown,keyId:string,secret:string,fetcher:typeof fetch=fetch){
 const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password)throw Error('INVALID_GATEWAY');const path='/api/internal/whatsapp/v2/notification-preview',body=JSON.stringify(intent);
 const response=await fetcher(new URL(path,u),{method:'POST',body,headers:{'Content-Type':'application/json',...signedHeaders('POST',path,body,keyId,secret)},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('V2_PREVIEW_UNAVAILABLE');const reader=response.body?.getReader();if(!reader)throw Error('INVALID_V2_RESPONSE');const chunks:Uint8Array[]=[];let size=0;for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>32768){await reader.cancel();throw Error('BODY_TOO_LARGE')}chunks.push(p.value)}return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) as unknown;
}
