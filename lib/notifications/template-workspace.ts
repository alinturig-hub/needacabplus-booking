import {signedHeaders} from '../whatsapp-service-auth';
export async function templateWorkspace(input:unknown,fetcher:typeof fetch=fetch){
 if(process.env.NOTIFICATIONS_TEMPLATE_WORKSPACE_ENABLED!=='true')throw Error('TEMPLATE_WORKSPACE_NOT_CONFIGURED');
 const origin=new URL(process.env.WHATSAPP_GATEWAY_ORIGIN||'');if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('INVALID_GATEWAY');
 const path='/api/internal/whatsapp/v1/template-workspace',body=JSON.stringify(input);
 const response=await fetcher(new URL(path,origin),{method:'POST',body,headers:{'Content-Type':'application/json',...signedHeaders('POST',path,body,process.env.WHATSAPP_NAC_KEY_ID||'',process.env.WHATSAPP_NAC_SECRET||'')},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('TEMPLATE_WORKSPACE_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw Error('TEMPLATE_RESPONSE_INVALID');let size=0;const chunks:Uint8Array[]=[];
 for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>262144){await reader.cancel();throw Error('TEMPLATE_RESPONSE_TOO_LARGE')}chunks.push(p.value)}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
