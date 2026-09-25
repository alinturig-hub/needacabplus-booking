import {randomUUID,timingSafeEqual} from 'node:crypto';
import {database} from '@/lib/database';
import {decryptCredentials} from '@/lib/credentials';
import {saveAutocabBooking} from '@/lib/autocab-bookings';
import {bookingEvents} from '@/lib/booking-events';

export const dynamic='force-dynamic';
const MAX_BODY_BYTES=2_000_000;

function equal(left:string,right:string){const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b)}
function json(status:number,body:Record<string,unknown>){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}})}

export async function POST(request:Request,{params}:{params:Promise<{webhookPath:string[]}>}){
 const forwarded=request.headers.get('x-forwarded-host')||request.headers.get('host')||'';
 const host=forwarded.split(',')[0].trim().split(':')[0].toLowerCase();
 if(process.env.NODE_ENV==='production'&&host!=='webhook.needacabplus.app')return json(404,{error:'Webhook endpoint not found.'});
 const parts=(await params).webhookPath;
 const suffix=`/${parts.map(part=>decodeURIComponent(part)).join('/')}`;
 const contentLength=Number(request.headers.get('content-length')||0);
 if(contentLength>MAX_BODY_BYTES)return json(413,{error:'Webhook payload is too large.'});
 try{
  const db=database();
  const match=await db.query(`SELECT w.id AS webhook_id,w.event_type,p.id AS provider_id,p.api_key_header,p.api_key_encrypted
   FROM provider_webhooks w JOIN webhook_providers p ON p.id=w.provider_id
   WHERE w.event_url_suffix=$1 AND w.enabled=true AND p.enabled=true LIMIT 1`,[suffix]);
  if(!match.rowCount)return json(404,{error:'Webhook endpoint not found.'});
  const item=match.rows[0] as {webhook_id:string;event_type:string;provider_id:string;api_key_header:string;api_key_encrypted:string};
  if(!item.api_key_encrypted)return json(401,{error:'Webhook API key is not configured.'});
  let credentials:Record<string,string>;try{credentials=decryptCredentials(item.api_key_encrypted)}catch{return json(401,{error:'Webhook API key is not configured.'})}const expected=credentials.token||'';
  const received=request.headers.get(item.api_key_header)||'';
  if(!expected||!received||!equal(received,expected))return json(401,{error:'Invalid webhook API key.'});
  const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)return json(413,{error:'Webhook payload is too large.'});
  let payload:unknown;try{payload=raw?JSON.parse(raw):{}}catch{return json(400,{error:'Webhook body must contain valid JSON.'})}
  const eventId=randomUUID();const sourceIp=(request.headers.get('x-forwarded-for')||'').split(',')[0].trim();
  let booking:{saved:boolean;reason?:string;externalBookingId?:string;status?:string};
  try{booking=await saveAutocabBooking(db,payload,item.event_type)}catch(error){console.error('Booking normalization failure',error);booking={saved:false,reason:'Payload stored; booking normalization failed'}}
  await db.query('UPDATE provider_webhooks SET received_count=received_count+1,last_received_at=now(),updated_at=now() WHERE id=$1',[item.webhook_id]);
  if(!booking.saved)await db.query('INSERT INTO webhook_events (id,provider_id,webhook_id,event_type,payload,content_type,source_ip) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)',[eventId,item.provider_id,item.webhook_id,item.event_type,JSON.stringify(payload),request.headers.get('content-type')||'',sourceIp]);
  else bookingEvents.emit('booking',{eventId,eventType:item.event_type,externalBookingId:booking.externalBookingId,status:booking.status});
  return json(202,{accepted:true,eventId,eventType:item.event_type,booking,receivedAt:new Date().toISOString()});
 }catch(error){console.error('Webhook intake failure',error);return json(500,{error:'Webhook could not be stored.'})}
}
