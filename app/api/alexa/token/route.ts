import {boundedBody} from '@/lib/alexa/body';
import {alexaConfig,equalSecret} from '@/lib/alexa/policy';
import {exchangeToken} from '@/lib/alexa/oauth';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Pragma':'no-cache'};
export async function POST(request:Request){
 try{
  const config=alexaConfig();if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return Response.json({error:'invalid_request'},{status:400,headers});
  const raw=await boundedBody(request,8192);if(raw.length>8192)return Response.json({error:'invalid_request'},{status:400,headers});const form=new URLSearchParams(raw);
  let client=form.get('client_id')||'',secret=form.get('client_secret')||'';const basic=request.headers.get('authorization');
  if(basic?.startsWith('Basic ')){const value=Buffer.from(basic.slice(6),'base64').toString('utf8'),index=value.indexOf(':');if(index<0)throw Error('INVALID_CLIENT');client=decodeURIComponent(value.slice(0,index));secret=decodeURIComponent(value.slice(index+1));}
  if(!equalSecret(client,config.clientId)||!equalSecret(secret,config.secret))return Response.json({error:'invalid_client'},{status:401,headers});
  return Response.json(await exchangeToken(form),{headers});
 }catch(error){const code=error instanceof Error?error.message:'';return Response.json({error:code==='ALEXA_NOT_CONFIGURED'?'temporarily_unavailable':code==='UNSUPPORTED_GRANT_TYPE'?'unsupported_grant_type':'invalid_grant'},{status:code==='ALEXA_NOT_CONFIGURED'?503:400,headers});}
}
