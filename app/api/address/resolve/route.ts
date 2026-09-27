import {z} from 'zod';
import {AutocabApiError,AutocabConfigurationError,resolveAddressPlaceId} from '@/lib/autocab-api';
import {unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const placeIdSchema=z.string().trim().min(3).max(600);

export async function GET(request:Request){
 try{
  const placeId=placeIdSchema.parse(new URL(request.url).searchParams.get('placeId')||'');
  const address=await resolveAddressPlaceId(placeId);
  return Response.json({item:{address:String(address.text||''),fullAddress:address,placeID:placeId,customAddressID:address.id||null}},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({error:'Invalid address selection.'},{status:400});if(error instanceof AutocabConfigurationError)return Response.json({error:error.message},{status:503});if(error instanceof AutocabApiError)return Response.json({error:error.message},{status:502});return unavailable(error)}
}
