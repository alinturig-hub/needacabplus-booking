import type {Pool} from 'pg';
import {withTaxiCrmReadOnly} from './taxicrm-database';
import {gatewayScope,whatsappGatewayEnabled} from './whatsapp-gateway';
import {journeyMilestones,journeyEvidence,normalizeJourneyPhone,type JourneyBooking} from './whatsapp-journey';
async function canonicalRows(now:Date){return withTaxiCrmReadOnly(async db=>{
 const rows=(await db.query<JourneyBooking>(`SELECT "externalId",status,"telephoneNumber","bookedAtTime","acceptedAt","arrivedAt","pickedUpAt","completedAt","cancelledAt","driverId","vehicleId" FROM "Booking" WHERE provider='AUTOCAB' AND "updatedAt">=$1 AND "updatedAt"<=$2 ORDER BY "updatedAt","id" LIMIT 10001`,[new Date(now.getTime()-15*60000),now])).rows;
 if(rows.length>10000)throw Error('JOURNEY_CAPTURE_CAPACITY_EXCEEDED');return rows;
});}
/** NeedACab decides notifications from the authoritative read-only journey state, including telephone bookings. */
export async function captureJourneyNotifications(db:Pool,now=new Date(),load:(now:Date)=>Promise<JourneyBooking[]>=canonicalRows){
 if(!whatsappGatewayEnabled()||process.env.WHATSAPP_JOURNEY_CAPTURE_ENABLED!=='true')return 0;gatewayScope();let captured=0;
 for(const booking of await load(now)){
 let recipient:string;try{recipient=normalizeJourneyPhone(booking.telephoneNumber||'');}catch{continue;}
 for(const event_type of journeyMilestones){const evidence=journeyEvidence(booking,event_type,now.getTime());if(!evidence||evidence.expiresAt<=now.getTime())continue;
 const booking_id='autocab:'+booking.externalId,revision=evidence.revision,idempotency_key=`${booking_id}:${event_type}:${recipient}:${revision}`;
 // Parameters are resolved again from the canonical booking by the central dispatcher.
 const payload={schema_version:'1.0',workspace_id:process.env.WHATSAPP_WORKSPACE_ID,idempotency_key,recipient,booking_id,event_type,revision,template_binding:event_type,parameters:[booking.externalId],expires_at:new Date(evidence.expiresAt).toISOString()};
 const result=await db.query(`INSERT INTO whatsapp_notification_outbox(operation_key,payload,expires_at) VALUES($1,$2::jsonb,$3) ON CONFLICT(operation_key) DO NOTHING`,[idempotency_key,JSON.stringify(payload),payload.expires_at]);captured+=result.rowCount||0;
 }}return captured;
}
