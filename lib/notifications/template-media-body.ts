export async function templateMediaBody(request:Request):Promise<Uint8Array>{
 const reader=request.body?.getReader();if(!reader)throw Error('INVALID_MEDIA');
 const parts:Uint8Array[]=[];let size=0;
 for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>16*1024*1024){await reader.cancel();throw Error('BODY_TOO_LARGE')}parts.push(next.value)}
 if(!size)throw Error('INVALID_MEDIA');return Buffer.concat(parts);
}
