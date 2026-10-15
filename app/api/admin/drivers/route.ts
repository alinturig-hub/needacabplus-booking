import {fleetList} from '@/lib/fleet-admin';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
export async function GET(request:Request){if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{return Response.json(await fleetList('drivers',request),{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}}
export async function POST(request:Request){if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{const {syncAutocabRegistry}=await import('@/lib/autocab/registry-sync');return Response.json(await syncAutocabRegistry('DRIVERS'))}catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to synchronize Autocab drivers.'},{status:502})}}
