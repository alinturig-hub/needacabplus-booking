import {signedHeaders} from '../whatsapp-service-auth';
export class TemplateWorkspaceError extends Error {constructor(public code:string,public status=503){super(code)}}
async function gatewayRequest(path:string,body:string|Uint8Array,fetcher:typeof fetch=fetch){
 if(process.env.NOTIFICATIONS_TEMPLATE_WORKSPACE_ENABLED!=='true')throw new TemplateWorkspaceError('TEMPLATE_WORKSPACE_NOT_CONFIGURED');
 const origin=new URL(process.env.WHATSAPP_GATEWAY_ORIGIN||'');if(origin.protocol!=='https:'||origin.username||origin.password)throw new TemplateWorkspaceError('INVALID_GATEWAY');
 let response:Response;
 try {response=await fetcher(new URL(path,origin),{method:'POST',body:body as BodyInit,headers:{'Content-Type':typeof body==='string'?'application/json':'application/octet-stream',...signedHeaders('POST',path,body,process.env.WHATSAPP_NAC_KEY_ID||'',process.env.WHATSAPP_NAC_SECRET||'')},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(typeof body==='string'?20000:45000)});}catch{throw new TemplateWorkspaceError('TEMPLATE_GATEWAY_OUTCOME_UNKNOWN')}
 const reader=response.body?.getReader();if(!reader)throw new TemplateWorkspaceError('TEMPLATE_RESPONSE_INVALID');let size=0;const chunks:Uint8Array[]=[];
 for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>262144){await reader.cancel();throw new TemplateWorkspaceError('TEMPLATE_RESPONSE_TOO_LARGE')}chunks.push(p.value)}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 if(!response.ok)throw new TemplateWorkspaceError(typeof data.error==='string'&&/^[A-Z0-9_]{1,80}$/.test(data.error)?data.error:'TEMPLATE_WORKSPACE_UNAVAILABLE',response.status);
 return data;
}
export async function templateWorkspace(input:unknown,fetcher:typeof fetch=fetch){return gatewayRequest('/api/internal/whatsapp/v1/template-workspace',JSON.stringify(input),fetcher)}
export async function templateMediaWorkspace(bytes:Uint8Array,fetcher:typeof fetch=fetch){return gatewayRequest('/api/internal/whatsapp/v1/template-media',bytes,fetcher)}
/** A lost mutation response must never be described as a confirmed non-write. */
export function templateWorkspacePublicFailure(action:string,error:unknown){
 const known=error instanceof TemplateWorkspaceError;
 const unknown=action==='submit'&&(!known||['TEMPLATE_GATEWAY_OUTCOME_UNKNOWN','WHATSAPP_UNAVAILABLE','TEMPLATE_WORKSPACE_UNAVAILABLE','TEMPLATE_RESPONSE_INVALID','TEMPLATE_RESPONSE_TOO_LARGE'].includes(error.code));
 return {error:unknown?'TEMPLATE_SUBMISSION_UNCONFIRMED':known?error.code:'TEMPLATE_REQUEST_FAILED',status:known?error.status:503};
}
