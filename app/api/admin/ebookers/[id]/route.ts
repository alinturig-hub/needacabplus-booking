import {z} from 'zod';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {ebookerInputSchema} from '@/lib/ebooker-policy';
import {ebookerFromRow,type EbookerRow} from '@/lib/ebookers';
import {deleteEbooker} from '@/lib/ebooker-delete';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const id=z.string().uuid().parse((await params).id),raw=await request.text();if(raw.length>64_000)return Response.json({error:'Configuration is too large.'},{status:413});
  const body=z.object({revision:z.number().int().positive(),settings:ebookerInputSchema}).strict().parse(JSON.parse(raw));
  const result=await database().query<EbookerRow>(`UPDATE ebookers SET settings=$2::jsonb,enabled=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND slug=$4 AND revision=$5 AND NOT(settings ? '_deletedAt') RETURNING *`,[id,JSON.stringify(body.settings),body.settings.enabled,body.settings.slug,body.revision]);
  if(!result.rows[0])return Response.json({error:'The settings changed or the public link was renamed. Reload before saving; existing links cannot be renamed.'},{status:409});
  return Response.json({item:ebookerFromRow(result.rows[0])});
 }catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Check the eBooker settings.'},{status:400});return unavailable(e)}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const id=z.string().uuid().parse((await params).id),raw=await request.text();
  if(raw.length>4096)return Response.json({error:'Request is too large.'},{status:413});
  const {revision}=z.object({revision:z.number().int().positive()}).strict().parse(JSON.parse(raw));
  const result=await deleteEbooker(database(),id,revision);
  if(result==='default')return Response.json({error:'The default eBooker is used by the main booking page and cannot be deleted.'},{status:409});
  if(result==='missing')return Response.json({error:'eBooker not found.'},{status:404});
  if(result==='conflict')return Response.json({error:'This eBooker changed. Reload before deleting it.'},{status:409});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Invalid deletion request.'},{status:400});return unavailable(e)}
}
