import {publicClearVehicles} from '@/lib/live-drivers';
import {unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
export async function GET(request:Request){try{return Response.json(await publicClearVehicles(new URL(request.url).searchParams.get('source')==='webhook'),{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}}
