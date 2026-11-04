import {parameterKeys} from '../../components/shared-whatsapp/template-parameters';
import {ruleSchema,type Rule,type Context,type Decision,type Field} from './model';
export function londonTime(value:string){const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('INVALID_PICKUP_TIME');return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short',hourCycle:'h23'}).format(date)}
export function decide(input:Rule,c:Context):Decision{
 const r=ruleSchema.parse(input),now=Date.parse(c.now),occurred=Date.parse(c.event.occurredAt),inbound=c.conversation.lastEligibleInboundAt?Date.parse(c.conversation.lastEligibleInboundAt):NaN;
 const windowOpen=Number.isFinite(inbound)&&inbound<=now&&now-inbound<86400000;
 const d:Decision={mode:'DRY_RUN',wouldSend:false,result:'blocked',reason:'INVALID_EVENT',channel:'none',bookingId:c.booking.id,event:c.event.type,eventRevision:c.event.revision,ruleId:r.id,ruleVersion:r.version,idempotencyKey:`operational:${c.booking.id}:${c.event.type}:${c.event.revision}`,decidedAt:c.now,providerStatus:c.provider.outcome,conversationId:c.conversation.id,windowOpen,issues:[]};
 const stop=(reason:string,result:Decision['result']='blocked',channel:Decision['channel']='none')=>({...d,reason,result,channel});
 if(!Number.isFinite(now)||!Number.isFinite(occurred)||occurred>now||c.event.bookingId!==c.booking.id||c.event.type!==r.event||!Number.isSafeInteger(c.event.revision)||c.event.revision<1)return stop('INVALID_EVENT');
 if(r.status!=='active')return stop('RULE_NOT_ACTIVE','omitted');
 if(c.seen)return stop('DUPLICATE_EVENT','omitted');
 if(c.event.revision<c.highestRevision||c.event.revision!==c.booking.revision)return stop('STALE_EVENT','omitted');
 if(now-occurred>=r.ttlSeconds*1000)return stop('NOTIFICATION_EXPIRED','omitted');
 if(c.booking.cancelled)return stop('BOOKING_CANCELLED','omitted');
 if(!r.conditions.sources.includes(c.booking.source))return stop('CONDITION_NOT_MET','omitted');
 if(c.booking.source==='webapp'&&c.booking.accountLinkVerified&&c.booking.appAccountId)return stop('APP_NOTIFICATION_FLOW_SELECTED','omitted','app');
 // A webapp booking with unresolved account ownership must not be treated as a guest.
 if(c.booking.source==='webapp'&&!c.booking.accountLinkVerified)return stop('APP_ACCOUNT_LINK_UNRESOLVED');
 if(!c.recipient.verified)return stop('NO_VERIFIED_RECIPIENT');
 if(!c.recipient.servicePermission)return stop('SERVICE_PERMISSION_REQUIRED');
 if(c.recipient.suppressed)return stop('RECIPIENT_SUPPRESSED');
 if(c.conversation.operator)return stop('OPERATOR_TAKEOVER');
 if(c.provider.outcome==='UNKNOWN')return stop('SEND_OUTCOME_UNKNOWN');
 if(['ACCEPTED','DELIVERED','READ'].includes(c.provider.outcome))return stop('PROVIDER_ALREADY_ACCEPTED','omitted');
 const values={...c.booking.fields,booking_id:c.booking.id};
 if(values.pickup_time){try{values.pickup_time=londonTime(values.pickup_time)}catch{return stop('INVALID_PICKUP_TIME')}}
 if(r.conditions.requireDriver&&!values.driver_name)return stop('REQUIRED_BOOKING_FIELD_MISSING');
 const render=(text:string)=>{
  let missing=false;const result=text.replace(/\{\{([^{}]+)\}\}/g,(_,key:string)=>{const source=r.bodyMappings.find(m=>m.variable===key)?.source;const value=source?values[source]:undefined;if(!value?.trim()){missing=true;d.issues.push(source?`Missing ${source}`:`Unmapped ${key}`)}return value||''});
  if(missing)return null;if(/[{}]/.test(result)){d.issues.push('Unresolved or malformed placeholders');return null}return result;
 };
 let text:string;
 if(c.provider.definitivelyUnavailable){
  if(r.sms!=='confirmed_unavailable'||!c.capabilities.sms)return stop('WHATSAPP_DEFINITIVELY_UNAVAILABLE');
  d.channel='sms';d.contentMode='sms';text=r.smsText;if(!text.trim())return stop('SMS_MESSAGE_NOT_CONFIGURED');
 }else if(c.provider.outcome==='REJECTED'||c.provider.outcome==='FAILED')return stop('PROVIDER_FAILURE_REQUIRES_REVIEW');
 else if(windowOpen){
  d.channel='whatsapp';d.contentMode=r.openWindowMode||'text';
  // Stage one has no interactive sender. Never silently downgrade a required action.
  if(d.contentMode==='interactive')return stop('INTERACTIVE_ADAPTER_UNAVAILABLE');
  if(!c.capabilities.freeText)return stop('FREE_TEXT_ADAPTER_UNAVAILABLE');
  if(r.buttonMappings.length||c.template.buttons.length)d.issues.push('TEXT_ONLY_MODE: template buttons do not apply to this open-window message. Select interactive mode if actions are required; its adapter is not implemented yet.');
  text=r.freeText;
 }

 else {
  const t=c.template;d.channel='whatsapp';d.contentMode='template';d.templateId=t.id;
  if(t.id!==r.template.id||t.name!==r.template.name||t.language!==r.template.language||t.fingerprint!==r.template.fingerprint)return stop('TEMPLATE_MAPPING_MISMATCH');
  if(t.status!=='APPROVED')return stop('TEMPLATE_NOT_APPROVED');
  if(t.category!=='UTILITY')return stop('TEMPLATE_CATEGORY_NOT_OPERATIONAL');
  if(t.hasHeader&&!c.capabilities.media)return stop('HEADER_ADAPTER_UNAVAILABLE');
  if(r.bodyMappings.some(m=>!c.capabilities.parameterSources.includes(m.source)))return stop('BOOKING_FIELD_ADAPTER_UNAVAILABLE');
  if(t.format==='NAMED'&&!c.capabilities.named)return stop('NAMED_PARAMETER_ADAPTER_UNAVAILABLE');
  let variables:string[];try{variables=parameterKeys(t.text,t.format)}catch{return stop('TEMPLATE_MAPPING_MISMATCH')}
  if(variables.length!==r.bodyMappings.length||variables.some(v=>!r.bodyMappings.some(m=>m.variable===v)))return stop('TEMPLATE_MAPPING_MISMATCH');
  if(r.bodyMappings.some(m=>{const value=values[m.source];return typeof value==='string'&&(value.length>1024||/[\x00-\x1f]/.test(value))}))return stop('INVALID_TEMPLATE_PARAMETER');
  if(t.buttons.some(b=>b.kind==='QUICK_REPLY'||b.kind==='FLOW'))return stop('BUTTON_BEHAVIOUR_NOT_IMPLEMENTED');
  const dynamic=t.buttons.filter(b=>b.dynamic);
  if(dynamic.length!==r.buttonMappings.length||new Set(r.buttonMappings.map(b=>b.index)).size!==r.buttonMappings.length||dynamic.some(b=>!r.buttonMappings.some(m=>m.index===b.index)))return stop('TEMPLATE_MAPPING_MISMATCH');
  if(t.buttons.length&&!c.capabilities.dynamicButtons)return stop('BUTTON_ADAPTER_UNAVAILABLE');
  d.buttonValues=[];for(const b of r.buttonMappings){const value=values[b.source];if(!value)return stop('REQUIRED_BOOKING_FIELD_MISSING');try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error()}catch{return stop('INVALID_SECURE_BOOKING_LINK')}d.buttonValues.push({index:b.index,value});}
  text=t.text;
 }
 const rendered=render(text);if(rendered===null)return stop('REQUIRED_BOOKING_FIELD_MISSING');
 const maxLength=d.channel==='sms'?1000:d.contentMode==='text'?4096:undefined;
 if(maxLength!==undefined&&rendered.length>maxLength){d.issues.push(`Rendered ${d.contentMode} message exceeds the ${maxLength}-character adapter limit.`);return stop('MESSAGE_LENGTH_EXCEEDED');}
 d.mappingValues=r.bodyMappings.map(m=>({variable:m.variable,source:m.source as Field,value:values[m.source]||''}));
 return {...d,result:'ready',reason:c.provider.definitivelyUnavailable?'SMS_FALLBACK_PREVIEW':'PREVIEW_READY',wouldSend:true,content:rendered};
}
