import {database} from '@/lib/database';
import {isAdmin,unavailable} from '@/lib/security';
import {autocabReferenceZone} from '@/lib/map-zone-display';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const result=await database().query(`SELECT z."externalId",z.name,z."rawPayload" FROM public."Zone" z WHERE z.provider='AUTOCAB' AND z."companyId"=1 AND z.active AND NOT EXISTS(SELECT 1 FROM public.map_zones m WHERE m.source_provider=z.provider AND m.source_external_id=z."externalId") ORDER BY z."mdtZoneId"`);
  return Response.json({zones:result.rows.map(autocabReferenceZone).filter(Boolean)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return unavailable(e)}
}
