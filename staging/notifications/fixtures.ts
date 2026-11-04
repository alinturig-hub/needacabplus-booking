import {z} from 'zod';
import {sampleRule,fixture,scenarios} from '../../lib/notifications/fixtures';
import {gatewayState} from '../../lib/notifications/v2/context';
export const selectionSchema=z.object({scenario:z.enum([...scenarios,'takeover-during-context','cancel-after-intent'] as const),event:z.enum(['booking.confirmed','driver.dispatched']),variant:z.enum(['plain','named','dynamic','missing-link','interactive','oversized']),fixture_at:z.string().datetime()}).strict();
export type Selection=z.infer<typeof selectionSchema>;
export function buildFixture(selection:Selection,now=Date.now()){
 const rule={...sampleRule(selection.event),status:'active' as const,sms:'confirmed_unavailable' as const};
 const scenario=selection.scenario==='takeover-during-context'||selection.scenario==='cancel-after-intent'?'other-closed':selection.scenario;
 if(selection.variant==='named'){rule.freeText='Hello {{customer_name}}, booking {{booking_id}}.';rule.bodyMappings=[{variable:'customer_name',source:'customer_name'},{variable:'booking_id',source:'booking_id'}]}
 if(selection.variant==='dynamic'||selection.variant==='missing-link')rule.buttonMappings=[{index:0,source:'track_driver_url'}];
 if(selection.variant==='interactive')Object.assign(rule,{openWindowMode:'interactive'});
 const context=fixture(rule,scenario);context.now=new Date(now).toISOString();const at=Date.parse(selection.fixture_at);
 context.event.occurredAt=new Date(at-(scenario==='expired'?3600000:60000)).toISOString();
 if(scenario==='other-open'||selection.variant==='interactive')context.conversation.lastEligibleInboundAt=new Date(at-3600000).toISOString();
 if(selection.variant==='named')context.template.format='NAMED';
 if(selection.variant==='dynamic'||selection.variant==='missing-link'){context.template.buttons=[{index:0,kind:'URL',dynamic:true}];if(selection.variant==='dynamic')context.booking.fields.track_driver_url='https://synthetic.invalid/opaque-staging-token'}
 if(selection.variant==='oversized'){rule.freeText='X'.repeat(4088)+'{{1}}';rule.bodyMappings=[{variable:'1',source:'customer_name'}];context.booking.fields.customer_name='A'.repeat(9);context.conversation.lastEligibleInboundAt=new Date(at-3600000).toISOString()}
 const state=gatewayState(context);return {rule,context,state};
}
