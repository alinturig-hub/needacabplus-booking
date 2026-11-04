import {createHash,createHmac,randomUUID,timingSafeEqual} from "node:crypto";
export function signedHeaders(method:string,path:string,body:string,keyId:string,secret:string,now=Date.now(),nonce:string=randomUUID()){
 if(secret.length<32||!keyId)throw Error("WHATSAPP_SERVICE_NOT_CONFIGURED");
 const timestamp=String(Math.floor(now/1000));
 const canonical=[method.toUpperCase(),path,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
 return {'x-wa-key':keyId,'x-wa-timestamp':timestamp,'x-wa-nonce':nonce,'x-wa-signature':createHmac('sha256',secret).update(canonical).digest('hex')};
}
export async function verifyService(request:Request,body:string,keyId:string,secret:string,reserve:(nonce:string)=>Promise<boolean>,now=Date.now()){
 const timestamp=request.headers.get('x-wa-timestamp')||'',nonce=request.headers.get('x-wa-nonce')||'',signature=request.headers.get('x-wa-signature')||'';
 if(secret.length<32||!keyId)throw Error('WHATSAPP_SERVICE_NOT_CONFIGURED');
 if(request.headers.get('x-wa-key')!==keyId||!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||!/^[a-zA-Z0-9_-]{16,100}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(signature))throw Error('UNAUTHORIZED');
 const u=new URL(request.url),expected=signedHeaders(request.method,u.pathname+u.search,body,keyId,secret,Number(timestamp)*1000,nonce)['x-wa-signature'];
 if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))throw Error('UNAUTHORIZED');
 if(!await reserve(keyId+':'+nonce))throw Error('REPLAY');
}
export async function boundedBody(request:Request){
 const reader=request.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;
 for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>32768){await reader.cancel();throw Error('BODY_TOO_LARGE');}chunks.push(p.value);}
 return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}
