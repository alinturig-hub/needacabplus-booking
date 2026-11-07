import {signedHeaders} from '../whatsapp-service-auth';
export async function inboxGateway(path:string,fetcher:typeof fetch=fetch){
 if(process.env.WHATSAPP_SHARED_ENABLED!=='true')throw Error('INBOX_UNAVAILABLE');
 if(!/^\/api\/internal\/whatsapp\/v1\/conversations(?:\/[a-zA-Z0-9_-]{1,100}\/messages)?(?:\?[a-zA-Z0-9_%=&+.-]{0,1000})?$/.test(path))throw Error('INVALID_PATH');
 const origin=new URL(process.env.WHATSAPP_GATEWAY_ORIGIN||'');if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('INVALID_GATEWAY');
 const response=await fetcher(new URL(path,origin),{method:'GET',headers:signedHeaders('GET',path,'',process.env.WHATSAPP_NAC_KEY_ID||'',process.env.WHATSAPP_NAC_SECRET||''),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('INBOX_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw Error('INBOX_UNAVAILABLE');const chunks:Uint8Array[]=[];let size=0;
 for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>524288){await reader.cancel();throw Error('INBOX_UNAVAILABLE')}chunks.push(p.value)}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
