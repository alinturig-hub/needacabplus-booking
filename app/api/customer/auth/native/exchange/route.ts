import {consumeNativeGrant} from '@/lib/native-auth';
import {setCustomerSession} from '@/lib/customer-auth';
import {requestAuthLimit} from '@/lib/customer-verification';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(process.env.CUSTOMER_APP_ORIGIN||'https://webapp.needacabplus.app').origin)return Response.json({error:'Invalid origin.'},{status:403,headers});
  await requestAuthLimit(request);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return Response.json({error:'Invalid sign-in response.'},{status:415,headers});
  const reader=request.body?.getReader();if(!reader)throw Error('INVALID_NATIVE_GRANT');const chunks:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2048){await reader.cancel();return Response.json({error:'Invalid sign-in response.'},{status:400,headers})}chunks.push(part.value)}
  const body=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  const customerId=await consumeNativeGrant(JSON.parse(body));await setCustomerSession(customerId);
  return Response.json({ok:true},{headers});
 }catch{return Response.json({error:'This app sign-in expired or was already used. Start Google sign-in again from the app.'},{status:401,headers})}
}
