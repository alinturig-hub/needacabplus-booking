import {z} from 'zod';
import {decryptCredentials} from '@/lib/credentials';
import {database} from '@/lib/database';
import {mapTilerStyleUrl} from '@/lib/map-settings';
import {isAdmin,sameOrigin} from '@/lib/security';

const schema=z.object({apiKey:z.string().trim().max(500).optional().default(''),style:z.string().trim().regex(/^[a-z0-9-]{1,80}$/).default('streets-v4')}).strict();
export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const body=schema.parse(await request.json()),row=(await database().query<{secrets_encrypted:string}>('SELECT secrets_encrypted FROM map_configuration WHERE id=true')).rows[0],stored=row?.secrets_encrypted?decryptCredentials(row.secrets_encrypted):{},apiKey=body.apiKey||stored.mapTilerApiKey;
  if(!apiKey)return Response.json({error:'Enter or save a MapTiler API key first.'},{status:400});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const headers={Accept:'application/json',Origin:'https://webapp.needacabplus.app',Referer:'https://webapp.needacabplus.app/'};
   const [style,search]=await Promise.all([
    fetch(mapTilerStyleUrl(body.style,apiKey),{headers,signal:controller.signal,cache:'no-store'}),
    fetch(`https://api.maptiler.com/geocoding/Plymouth.json?key=${encodeURIComponent(apiKey)}&country=gb&limit=1`,{headers,signal:controller.signal,cache:'no-store'}),
   ]);
   if(!style.ok||!search.ok)return Response.json({error:`MapTiler rejected the request (map ${style.status}, search ${search.status}). Check the key and its allowed origins.`},{status:502});
   return Response.json({ok:true,message:'Map tiles and address search are available.'});
  }finally{clearTimeout(timer)}
 }catch(error){return Response.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:'MapTiler connection failed.'},{status:400})}
}
