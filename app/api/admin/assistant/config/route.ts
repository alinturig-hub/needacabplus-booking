import {z} from 'zod';
import {aiModels,aiSettings} from '@/lib/admin-ai';
import {encryptCredentials} from '@/lib/credentials';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const schema=z.object({enabled:z.boolean(),model:z.enum(aiModels),apiKey:z.string().trim().max(300).optional(),clearKey:z.boolean().optional()}).strict();

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const {enabled,model,keyConfigured,keySource}=await aiSettings();return Response.json({enabled,model,keyConfigured,keySource},{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}
}

export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let body:z.infer<typeof schema>;
 try{body=schema.parse(await request.json())}catch{return Response.json({error:'Check the assistant settings.'},{status:400})}
 if(body.apiKey&&(!body.apiKey.startsWith('sk-')||body.apiKey.length<20))return Response.json({error:'Enter a valid OpenAI API key.'},{status:400});
 if(body.enabled&&!body.apiKey&&!process.env.OPENAI_API_KEY){
  const current=await aiSettings();
  if(!current.keyConfigured||body.clearKey)return Response.json({error:'Add an OpenAI API key before enabling the assistant.'},{status:400});
 }
 try{
  const encrypted=body.clearKey?'':body.apiKey?encryptCredentials({apiKey:body.apiKey}):null;
  await database().query(`INSERT INTO admin_ai_settings(id,enabled,model,api_key_encrypted,updated_at) VALUES (true,$1,$2,COALESCE($3,''),now()) ON CONFLICT(id) DO UPDATE SET enabled=EXCLUDED.enabled,model=EXCLUDED.model,api_key_encrypted=COALESCE($3,admin_ai_settings.api_key_encrypted),updated_at=now()`,[body.enabled,body.model,encrypted]);
  const {enabled,model,keyConfigured,keySource}=await aiSettings();
  return Response.json({enabled,model,keyConfigured,keySource},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
