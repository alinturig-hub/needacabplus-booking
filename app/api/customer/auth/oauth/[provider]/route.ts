import {nativeContext} from '@/lib/native-auth';
import {oauthStartLocation} from '@/lib/oauth-browser';
import {oauthErrorCode} from '@/lib/oauth-errors';
import {startOAuth,providerName} from '@/lib/customer-oauth';
import {requestAuthLimit} from '@/lib/customer-verification';
export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}){
 try{
  const provider=providerName((await params).provider),query=new URL(request.url).searchParams;
  const native=nativeContext(query.get('native_challenge'),query.get('native_state'));
  const canonical=oauthStartLocation(request.url,request.headers.get('host'),process.env.CUSTOMER_APP_ORIGIN||'https://webapp.needacabplus.app',provider);
  if(canonical){
   const target=new URL(canonical);if(native){target.searchParams.set('native_challenge',native.challenge);target.searchParams.set('native_state',native.state)}
   return new Response(null,{status:303,headers:{Location:target.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  await requestAuthLimit(request);
  return new Response(null,{status:303,headers:{Location:await startOAuth(provider,native),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch(error){const code=oauthErrorCode(error);console.error('Customer OAuth start failed',{code});return Response.redirect(new URL('/customer-login?error='+code,process.env.CUSTOMER_APP_ORIGIN||'https://webapp.needacabplus.app'))}
}
