import {parseIntent,parseState,parseResult,stable,type GatewayState,type IntentV2,type ResultV2} from './notifications-v2-contract';
export type PreviewDependencies={workspace:string;now:()=>number;state:(intent:IntentV2)=>Promise<GatewayState>;context:(intent:IntentV2,state:GatewayState)=>Promise<unknown>};
/** Contract rehearsal only. No import of outbox, dispatch or provider transport. */
export async function previewNotification(input:unknown,d:PreviewDependencies):Promise<ResultV2>{
 const intent=parseIntent(input,d.workspace),before=parseState(await d.state(intent));
 const result=parseResult(await d.context(intent,before),intent,before,d.now());
 // Re-read after the round trip: takeover/suppression/receipt races must fail closed.
 const after=parseState(await d.state(intent));
 const block=(reason:string):ResultV2=>({schema_version:'2.0',mode:'DRY_RUN',idempotency_key:intent.idempotency_key,booking_id:intent.booking_id,rule:intent.rule,conversation_id:after.conversation_id,conversation_revision:after.conversation_revision,checked_at:new Date(d.now()).toISOString(),result:'blocked',reason,channel:'none',provider_status:after.provider_status,provider_called:false});
 if(after.conversation_id!==before.conversation_id||after.conversation_revision<before.conversation_revision)throw Error('V2_CONVERSATION_CONFLICT');
 if(!after.recipient_verified)return block('NO_VERIFIED_RECIPIENT');
 if(!after.service_allowed)return block('SERVICE_PERMISSION_REQUIRED');
 if(after.operator)return block('OPERATOR_TAKEOVER');
 if(after.suppressed)return block('RECIPIENT_SUPPRESSED');
 if(after.provider_status==='UNKNOWN')return block('SEND_OUTCOME_UNKNOWN');
 if(stable(after)!==stable(before))return block('GATEWAY_STATE_CHANGED');
 if(Date.parse(intent.expires_at)<=d.now())return block('NOTIFICATION_EXPIRED');
 return result;
}
