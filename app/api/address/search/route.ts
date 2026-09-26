import {z} from 'zod';
import {AutocabApiError,AutocabConfigurationError,searchAddresses} from '@/lib/autocab-api';
import {unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const querySchema=z.string().trim().min(2).max(160);

export async function GET(request:Request){
 try{
  const query=querySchema.parse(new URL(request.url).searchParams.get('q')||'');
  const addresses=await searchAddresses(query,1);
  const items=addresses.slice(0,8).map(address=>({address:String(address.text||address.street||''),fullAddress:address,placeID:null,customAddressID:address.id||null})).filter(item=>item.address);
  return Response.json({items},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({items:[]});if(error instanceof AutocabConfigurationError)return Response.json({error:error.message},{status:503});if(error instanceof AutocabApiError)return Response.json({error:error.message},{status:502});return unavailable(error)}
}
