export async function boundedBody(request:Request,limit:number){
 const reader=request.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let size=0,text='';
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw Error('BODY_LIMIT');}text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
