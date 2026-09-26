import {isAdmin,unavailable} from '@/lib/security';
import {clearDrivers} from '@/lib/live-drivers';

export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403,headers:{'Cache-Control':'no-store'}});
 try{
  return Response.json(await clearDrivers(),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
