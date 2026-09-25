import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/lib/database';
import {encryptCredentials} from '@/lib/credentials';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';

const providerFields=z.object({
 name:z.string().trim().min(2).max(100),description:z.string().trim().max(1000).default(''),
 baseUrl:z.string().url().max(500).refine(value=>new URL(value).protocol==='https:','Use an HTTPS URL'),
 apiKeyHeader:z.string().trim().min(1).max(100).default('x-api-key'),apiKey:z.string().max(2000).default(''),enabled:z.boolean().default(true)
});
const webhookFields=z.object({
 providerId:z.string().uuid(),name:z.string().trim().min(2).max(100),description:z.string().trim().max(1000).default(''),
 eventUrlSuffix:z.string().trim().regex(/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/,'Use a suffix such as /booking_created'),
 eventType:z.string().trim().min(2).max(100),eventFilterRecipe:z.string().trim().max(4000).default(''),enabled:z.boolean().default(true)
});
const createSchema=z.discriminatedUnion('type',[
 providerFields.extend({type:z.literal('provider')}),webhookFields.extend({type:z.literal('webhook')})
]);
const updateSchema=z.discriminatedUnion('type',[
 providerFields.extend({type:z.literal('provider'),id:z.string().uuid()}),webhookFields.extend({type:z.literal('webhook'),id:z.string().uuid()})
]);

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const db=database();const [providers,webhooks,events]=await Promise.all([
  db.query("SELECT id,name,description,base_url,api_key_header,enabled,(api_key_encrypted <> '') AS has_api_key,created_at,updated_at FROM webhook_providers ORDER BY name"),
  db.query('SELECT id,provider_id,name,description,event_type,event_url_suffix,event_filter_recipe,enabled,created_at,updated_at FROM provider_webhooks ORDER BY name'),
  db.query(`SELECT e.id,e.provider_id,e.webhook_id,e.event_type,e.payload,e.received_at,w.name AS webhook_name
   FROM webhook_events e JOIN provider_webhooks w ON w.id=e.webhook_id ORDER BY e.received_at DESC LIMIT 100`)
 ]);return Response.json({providers:providers.rows,webhooks:webhooks.rows,events:events.rows},{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const body=createSchema.parse(await request.json());const id=randomUUID();const db=database();
  if(body.type==='provider'){
   if(!body.apiKey)return Response.json({error:'Create an internal API key for this webhook source.'},{status:400});
   await db.query('INSERT INTO webhook_providers (id,name,description,base_url,api_key_header,api_key_encrypted,enabled) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id,body.name,body.description,body.baseUrl.replace(/\/$/,''),body.apiKeyHeader,encryptCredentials({token:body.apiKey}),body.enabled]);
  }
  else{const owner=await db.query('SELECT id FROM webhook_providers WHERE id=$1',[body.providerId]);if(!owner.rowCount)return Response.json({error:'Provider not found.'},{status:404});await db.query('INSERT INTO provider_webhooks (id,provider_id,name,description,event_type,event_url_suffix,event_filter_recipe,enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,body.providerId,body.name,body.description,body.eventType,body.eventUrlSuffix,body.eventFilterRecipe,body.enabled])}
  return Response.json({id},{status:201});
 }catch(error){return apiError(error)}
}

export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const body=updateSchema.parse(await request.json());const db=database();
  if(body.type==='provider'){
   if(body.apiKey)await db.query('UPDATE webhook_providers SET name=$2,description=$3,base_url=$4,api_key_header=$5,api_key_encrypted=$6,enabled=$7,updated_at=now() WHERE id=$1',[body.id,body.name,body.description,body.baseUrl.replace(/\/$/,''),body.apiKeyHeader,encryptCredentials({token:body.apiKey}),body.enabled]);
   else await db.query('UPDATE webhook_providers SET name=$2,description=$3,base_url=$4,api_key_header=$5,enabled=$6,updated_at=now() WHERE id=$1',[body.id,body.name,body.description,body.baseUrl.replace(/\/$/,''),body.apiKeyHeader,body.enabled]);
  }else await db.query('UPDATE provider_webhooks SET name=$2,description=$3,event_type=$4,event_url_suffix=$5,event_filter_recipe=$6,enabled=$7,updated_at=now() WHERE id=$1',[body.id,body.name,body.description,body.eventType,body.eventUrlSuffix,body.eventFilterRecipe,body.enabled]);
  return Response.json({ok:true});
 }catch(error){return apiError(error)}
}

export async function DELETE(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const body=z.object({type:z.enum(['provider','webhook']),id:z.string().uuid()}).strict().parse(await request.json());const table=body.type==='provider'?'webhook_providers':'provider_webhooks';const result=await database().query(`DELETE FROM ${table} WHERE id=$1`,[body.id]);if(!result.rowCount)return Response.json({error:'Item not found.'},{status:404});return Response.json({ok:true})}catch(error){return apiError(error)}
}

function apiError(error:unknown){
 if(error instanceof z.ZodError)return Response.json({error:error.issues[0]?.message||'Check the webhook details.'},{status:400});
 if(error instanceof Error&&error.message.includes('duplicate key'))return Response.json({error:'A provider or webhook with these details already exists.'},{status:409});
 return unavailable(error);
}
