import {fleetList} from '@/lib/fleet-admin';
import {syncVehicles,AutocabApiError,AutocabConfigurationError} from '@/lib/autocab-api';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
export async function GET(request:Request){if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{return Response.json(await fleetList('vehicles',request),{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}}
export async function POST(request:Request){if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{return Response.json(await syncVehicles())}catch(error){if(error instanceof AutocabConfigurationError)return Response.json({error:error.message,needsConfiguration:true},{status:409});if(error instanceof AutocabApiError)return Response.json({error:error.message},{status:502});return unavailable(error)}}
