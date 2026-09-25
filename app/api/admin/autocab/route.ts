import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/lib/database';
import {encryptCredentials} from '@/lib/credentials';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';

const connectionSchema=z.object({
 type:z.literal('connection'),name:z.string().trim().min(2).max(80),baseUrl:z.string().url().max(500).refine(value=>new URL(value).protocol==='https:','Use an HTTPS URL'),authType:z.enum(['none','api_key','bearer','basic']),apiKeyHeader:z.string().trim().min(1).max(100).default('x-api-key'),token:z.string().max(2000).default(''),username:z.string().max(250).default(''),password:z.string().max(1000).default('')
}).strict().superRefine((value,context)=>{if(value.authType==='api_key'||value.authType==='bearer'){if(!value.token)context.addIssue({code:'custom',message:'A token or API key is required',path:['token']})}if(value.authType==='basic'&&(!value.username||!value.password))context.addIssue({code:'custom',message:'Username and password are required',path:['username']})});

const endpointSchema=z.object({
 type:z.literal('endpoint'),connectionId:z.string().uuid(),name:z.string().trim().min(2).max(100),actionKey:z.string().trim().regex(/^[a-z][a-z0-9_.-]{2,79}$/),method:z.enum(['GET','POST','PUT','PATCH','DELETE']),path:z.string().trim().min(1).max(500).refine(value=>value.startsWith('/')&&!value.startsWith('//'),'Path must start with /'),description:z.string().trim().max(500).default(''),requestExample:z.string().trim().min(2).max(100000).refine(value=>{try{JSON.parse(value);return true}catch{return false}},'Request example must be valid JSON')
}).strict();

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const db=database();
  const [connections,endpoints]=await Promise.all([
   db.query('SELECT id,name,provider,base_url,auth_type,api_key_header,created_at,updated_at FROM api_connections WHERE provider=$1 ORDER BY created_at',['autocab']),
   db.query('SELECT id,connection_id,name,action_key,method,path,description,request_example,enabled,created_at,updated_at FROM api_endpoints ORDER BY name')
  ]);
  return Response.json({connections:connections.rows,endpoints:endpoints.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let raw:unknown;try{raw=await request.json()}catch{return Response.json({error:'Invalid JSON request.'},{status:400})}
 try{
  const db=database();
  if((raw as {type?:unknown})?.type==='connection'){
   const body=connectionSchema.parse(raw);const id=randomUUID();
   const credentials:Record<string,string>=body.authType==='basic'?{username:body.username,password:body.password}:body.authType==='none'?{}:{token:body.token};
   await db.query('INSERT INTO api_connections (id,name,provider,base_url,auth_type,api_key_header,credentials_encrypted) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id,body.name,'autocab',body.baseUrl.replace(/\/$/,''),body.authType,body.apiKeyHeader,encryptCredentials(credentials)]);
   return Response.json({id},{status:201});
  }
  const body=endpointSchema.parse(raw);const id=randomUUID();
  const owner=await db.query('SELECT id FROM api_connections WHERE id=$1 AND provider=$2',[body.connectionId,'autocab']);
  if(!owner.rowCount)return Response.json({error:'Autocab connection not found.'},{status:404});
  await db.query('INSERT INTO api_endpoints (id,connection_id,name,action_key,method,path,description,request_example) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[id,body.connectionId,body.name,body.actionKey,body.method,body.path,body.description,JSON.stringify(JSON.parse(body.requestExample))]);
  return Response.json({id},{status:201});
 }catch(error){
  if(error instanceof z.ZodError)return Response.json({error:error.issues[0]?.message||'Check the API details.'},{status:400});
  if(error instanceof Error&&error.message.includes('duplicate key'))return Response.json({error:'That connection name or action key already exists.'},{status:409});
  return unavailable(error);
 }
}

export async function DELETE(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let body;try{body=z.object({type:z.enum(['connection','endpoint']),id:z.string().uuid()}).strict().parse(await request.json())}catch{return Response.json({error:'Invalid delete request.'},{status:400})}
 try{const table=body.type==='connection'?'api_connections':'api_endpoints';const result=await database().query(`DELETE FROM ${table} WHERE id=$1`,[body.id]);if(!result.rowCount)return Response.json({error:'Item not found.'},{status:404});return Response.json({ok:true})}catch(error){return unavailable(error)}
}
