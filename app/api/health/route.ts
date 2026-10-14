import {database} from '@/lib/database';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
 try{
  await database().query('SELECT 1');
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{
  return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
