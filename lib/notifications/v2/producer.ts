import {ruleSchema,type Rule,type Context} from '../model';
import {parseIntent,type IntentV2} from './contract';
/** Only synthetic DRY_RUN intent production. Reuses v1 key and event spelling. */
export function previewIntent(input:Rule,context:Context,workspace:string,recipient:string):IntentV2{
 const rule=ruleSchema.parse(input);if(!context.synthetic)throw Error('SYNTHETIC_ONLY');
 const booking_id='autocab:'+context.booking.id,event_type=rule.event==='driver.dispatched'?'driver.assigned':'booking.confirmed';
 return parseIntent({schema_version:'2.0',mode:'DRY_RUN',origin:'operational_notification',workspace_id:workspace,booking_id,event_type,revision:context.event.revision,recipient,idempotency_key:`${booking_id}:${event_type}:${recipient}:${context.event.revision}`,occurred_at:context.event.occurredAt,expires_at:new Date(Date.parse(context.event.occurredAt)+rule.ttlSeconds*1000).toISOString(),rule:{id:rule.id,version:rule.version},content:{open_window_mode:rule.openWindowMode||'text',template:rule.template,body_mappings:rule.bodyMappings,button_mappings:rule.buttonMappings}},workspace);
}
