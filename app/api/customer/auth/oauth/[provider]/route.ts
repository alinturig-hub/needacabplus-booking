import {oauthErrorCode} from '@/lib/oauth-errors';
import {startOAuth,providerName} from '@/lib/customer-oauth';
import {requestAuthLimit} from '@/lib/customer-verification';
export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}){try{await requestAuthLimit(request);return Response.redirect(await startOAuth(providerName((await params).provider)))}catch(error){const code=oauthErrorCode(error);console.error('Customer OAuth start failed',{code});return Response.redirect(new URL('/customer-login?error='+code,process.env.CUSTOMER_APP_ORIGIN||'https://webapp.needacabplus.app'))}}
