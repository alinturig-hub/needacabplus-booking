import {database} from '@/lib/database';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
 try{
  const schema=await database().query<{local_drivers_ready:boolean}>("SELECT to_regclass('public.local_drivers') IS NOT NULL AS local_drivers_ready");
  return Response.json({ok:true,localDriversReady:schema.rows[0]?.local_drivers_ready||false},{headers:{'Cache-Control':'no-store'}});
 }catch{
  return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
