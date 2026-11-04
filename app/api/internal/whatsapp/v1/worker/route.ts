import {workerAuthorized} from '@/lib/whatsapp-worker-auth';
import {database} from '@/lib/database';
import {captureConfirmedNotifications,flushNotifications} from '@/lib/whatsapp-gateway';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function POST(request:Request){if(!workerAuthorized(request))return Response.json({error:'UNAUTHORIZED'},{status:401});try{const db=database();const result={captured:await captureConfirmedNotifications(db),accepted:await flushNotifications(db)};await db.query("DELETE FROM whatsapp_service_nonce WHERE created_at<now()-interval '1 day'");return Response.json(result,{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'WHATSAPP_WORKER_UNAVAILABLE'},{status:503});}}
