import {database} from '@/lib/database';
import {receiveGatewayEvent} from '@/lib/whatsapp-gateway';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{return Response.json(await receiveGatewayEvent(database(),request),{headers:{'Cache-Control':'no-store'}});}catch(e){const code=e instanceof Error?e.message:'';return Response.json({error:'WHATSAPP_EVENT_UNAVAILABLE'},{status:code==='UNAUTHORIZED'||code==='REPLAY'?401:code==='INVALID_EVENT'?422:code==='EVENT_CONFLICT'?409:503,headers:{'Cache-Control':'no-store'}});}}
