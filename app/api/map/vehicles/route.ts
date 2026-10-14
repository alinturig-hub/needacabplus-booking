import {publicClearVehicles} from '@/lib/live-drivers';
import {unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await publicClearVehicles(),{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}}
