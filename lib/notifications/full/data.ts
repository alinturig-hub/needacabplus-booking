import {database} from '../../database';
import {canonicalNotificationBooking} from '../canonical';
import {ruleSchema,type Rule,type Context} from '../model';
import {journeyEvidence,normalizeJourneyPhone} from '../../whatsapp-journey';
import type {IntentV2} from '../v2/contract';
import {fullStageGuard} from './guard';
export async function loadFullContext(intent:IntentV2){
 fullStageGuard();const db=database();const before=(await db.query('SELECT revision::text FROM notification_stage_marker WHERE id=true')).rows[0].revision;
 const stored=(await db.query('SELECT request FROM notification_stage_intent WHERE operation_key=$1',[intent.idempotency_key])).rows[0];if(!stored)throw Error('STAGE_EVENT_NOT_FOUND');
 const rule=ruleSchema.parse((await db.query('SELECT definition FROM notification_rules WHERE id=$1',[intent.rule.id])).rows[0]?.definition);
 const event=rule.event,booking=await canonicalNotificationBooking(intent.booking_id.slice(8),event);if(!booking)throw Error('STAGE_BOOKING_NOT_FOUND');
 const row=(await db.query('SELECT * FROM "Booking" WHERE "externalId"=$1',[booking.id])).rows[0];
 const request=stored.request as {occurred_at:string;revision:number};
 const template=(await db.query('SELECT definition FROM notification_stage_template WHERE id=$1',[rule.template.id])).rows[0]?.definition;
 if(!template)throw Error('STAGE_TEMPLATE_NOT_FOUND');
 const context:Context={synthetic:true,now:new Date().toISOString(),event:{bookingId:booking.id,type:event,revision:request.revision,occurredAt:request.occurred_at},booking,recipient:{verified:false,servicePermission:false,suppressed:false},conversation:{id:'unresolved',operator:false,lastEligibleInboundAt:null},provider:{outcome:'NONE',definitivelyUnavailable:false},seen:false,highestRevision:booking.revision,template,capabilities:{parameterSources:[],freeText:false,named:false,dynamicButtons:false,media:false,sms:false}};
 // Existing canonical evidence, not the submitted payload, controls the current lifecycle.
 if(!booking.cancelled&&!journeyEvidence(row,intent.event_type))context.highestRevision=Math.max(context.highestRevision,request.revision+1);
 const after=(await db.query('SELECT revision::text FROM notification_stage_marker WHERE id=true')).rows[0].revision;
 if(before!==after)throw Error('CANONICAL_SNAPSHOT_CONFLICT');
 return {rule,context,canonicalRecipient:normalizeJourneyPhone(row.telephoneNumber||''),revision:after};
}
export async function storedRule(id:string):Promise<Rule>{return ruleSchema.parse((await database().query('SELECT definition FROM notification_rules WHERE id=$1',[id])).rows[0]?.definition)}
