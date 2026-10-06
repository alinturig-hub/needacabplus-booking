import {z} from 'zod';
import {database} from '@/lib/database';
import {decryptCredentials,encryptCredentials} from '@/lib/credentials';
import {readMapConfiguration} from '@/lib/map-settings';
import {defaultMapSettings,mapSettingsSchema} from '@/lib/map-settings-schema';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const inputSchema=z.object({settings:mapSettingsSchema,apiKey:z.string().trim().max(500).optional().default('')}).strict();

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const {settings,apiKey}=await readMapConfiguration();return Response.json({settings,apiKeyConfigured:Boolean(apiKey)},{headers:{'Cache-Control':'no-store'}})}catch(error){
  if(error instanceof Error&&error.message.includes('map_configuration'))return Response.json({settings:defaultMapSettings,apiKeyConfigured:false},{headers:{'Cache-Control':'no-store'}});
  return unavailable(error);
 }
}

export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const body=inputSchema.parse(await request.json()),current=await database().query<{secrets_encrypted:string}>('SELECT secrets_encrypted FROM map_configuration WHERE id=true'),stored=current.rows[0]?.secrets_encrypted?decryptCredentials(current.rows[0].secrets_encrypted):{};
  if(body.apiKey)stored.mapTilerApiKey=body.apiKey;
  if((body.settings.mapProvider==='maptiler'||body.settings.searchProvider==='maptiler')&&!stored.mapTilerApiKey)throw new Error('Enter a MapTiler API key before enabling MapTiler.');
  await database().query(`INSERT INTO map_configuration(id,settings,secrets_encrypted,updated_at) VALUES(true,$1::jsonb,$2,now()) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings,secrets_encrypted=EXCLUDED.secrets_encrypted,updated_at=now()`,[JSON.stringify(body.settings),Object.keys(stored).length?encryptCredentials(stored):'']);
  return Response.json({ok:true,settings:body.settings,apiKeyConfigured:Boolean(stored.mapTilerApiKey)});
 }catch(error){return Response.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:'Unable to save map settings.'},{status:400})}
}
