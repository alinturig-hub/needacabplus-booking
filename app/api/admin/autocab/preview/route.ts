import {database} from '@/lib/database';
import {decryptCredentials} from '@/lib/credentials';
import {isAdmin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';

type Endpoint={base_url:string;auth_type:'none'|'api_key'|'bearer'|'basic';api_key_header:string;credentials_encrypted:string;method:string;path:string;action_key:string};

// Inspect a configured read-only call without changing fleet records.
export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const id=new URL(request.url).searchParams.get('id');
 if(!id||!(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)))return Response.json({error:'Choose an API endpoint.'},{status:400});
 try{
  const result=await database().query<Endpoint>(`SELECT c.base_url,c.auth_type,c.api_key_header,c.credentials_encrypted,e.method,e.path,e.action_key
   FROM api_endpoints e JOIN api_connections c ON c.id=e.connection_id
   WHERE e.id=$1 AND e.enabled=true AND c.provider='autocab'`,[id]);
  const endpoint=result.rows[0];
  if(!endpoint)return Response.json({error:'Enabled Autocab endpoint not found.'},{status:404});
  if(endpoint.method!=='GET')return Response.json({error:'Only GET endpoints can be previewed.'},{status:400});
  const url=new URL(endpoint.path,`${endpoint.base_url.replace(/\/$/,'')}/`);
  if(url.protocol!=='https:')return Response.json({error:'The API must use HTTPS.'},{status:400});
  const credentials=decryptCredentials(endpoint.credentials_encrypted);
  const headers=new Headers({Accept:'application/json'});
  if(endpoint.auth_type==='api_key')headers.set(endpoint.api_key_header,credentials.token||'');
  if(endpoint.auth_type==='bearer')headers.set('Authorization',`Bearer ${credentials.token||''}`);
  if(endpoint.auth_type==='basic')headers.set('Authorization',`Basic ${Buffer.from(`${credentials.username||''}:${credentials.password||''}`).toString('base64')}`);
  const response=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)return Response.json({error:`Autocab returned HTTP ${response.status} for ${endpoint.action_key}.`},{status:502});
  if(!response.headers.get('content-type')?.includes('json'))return Response.json({error:'Autocab returned a non-JSON response.'},{status:502});
  const payload:unknown=await response.json();
  const root=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload as Record<string,unknown>:null;
  const records=Array.isArray(payload)?payload:Array.isArray(root?.data)?root.data:Array.isArray(root?.items)?root.items:Array.isArray(root?.drivers)?root.drivers:Array.isArray(root?.vehicles)?root.vehicles:null;
  const sourceSystems=records?[...new Set(records.map(item=>item&&typeof item==='object'?String((item as Record<string,unknown>).sourceSystem||'Autocab / unspecified'):'Autocab / unspecified'))]:[];
  return Response.json({actionKey:endpoint.action_key,recordCount:records?.length??null,sourceSystems,payload},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return unavailable(error)}
}
