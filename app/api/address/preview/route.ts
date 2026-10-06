import {z} from 'zod';
import {reverseOpenMapAddress} from '@/lib/open-map-address';

export const dynamic='force-dynamic';
const coordinate=z.coerce.number().finite();
export async function GET(request:Request){
 try{const url=new URL(request.url),latitude=coordinate.min(-90).max(90).parse(url.searchParams.get('latitude')),longitude=coordinate.min(-180).max(180).parse(url.searchParams.get('longitude')),address=await reverseOpenMapAddress(latitude,longitude);return Response.json({address},{headers:{'Cache-Control':'private, max-age=60','X-Address-Source':'OpenStreetMap'}})}catch(error){if(error instanceof z.ZodError)return Response.json({error:'Invalid location.'},{status:400});return Response.json({error:'Current address is still being verified.'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
