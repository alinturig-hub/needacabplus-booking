import {isAdmin} from '@/lib/security';
import {readBookingCapabilities,AutocabApiError,AutocabConfigurationError} from '@/lib/autocab-api';
import {enabledCapabilities} from '@/lib/autocab-capabilities';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{return Response.json({capabilities:enabledCapabilities(await readBookingCapabilities())},{headers:{'Cache-Control':'no-store'}})}
 catch(error){return Response.json({error:error instanceof AutocabApiError||error instanceof AutocabConfigurationError?error.message:'Unable to load capabilities from Autocab. Please retry.'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
