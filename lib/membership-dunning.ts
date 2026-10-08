import {randomUUID} from 'node:crypto';
import {database} from './database';
import {loadSmsPolicy} from './app-configuration';
import {sendSmsMessage} from './sms-transport';
export {membershipMessage,paymentFailureDecision} from './membership-dunning-policy';

type NotificationCategory='membership_payment_failed'|'membership_cancelled'|'membership_recovered';
export async function sendMembershipNotifications(input:{customerId:string;phone:string;tier:string;eventId:string;category:NotificationCategory;message:string;channels:{inApp:boolean;sms:boolean;email:boolean}}){
 const db=database(),title=input.category==='membership_payment_failed'?'Membership payment failed':input.category==='membership_cancelled'?'Membership cancelled':'Membership payment received';
 const channels=(['in_app','sms','email'] as const).filter(channel=>channel==='in_app'?input.channels.inApp:channel==='sms'?input.channels.sms:input.channels.email);
 for(const channel of channels){
  const id=randomUUID(),initialState=channel==='in_app'?'sent':'pending';
  const inserted=await db.query<{id:string}>(`INSERT INTO customer_notifications(id,customer_id,category,title,message,channel,state,source_event_id,sent_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7='sent' THEN now() END) ON CONFLICT(source_event_id,channel) WHERE source_event_id IS NOT NULL DO NOTHING RETURNING id`,[id,input.customerId,input.category,title,input.message,channel,initialState,input.eventId]);
  if(!inserted.rowCount||channel!=='sms')continue;
  try{
   const {settings,secrets}=await loadSmsPolicy();
   if(!settings.enabled||!input.phone)throw new Error('SMS notifications are not configured.');
   await sendSmsMessage(settings,secrets,input.phone,input.message);
   await db.query("UPDATE customer_notifications SET state='sent',sent_at=now() WHERE id=$1",[id]);
  }catch(error){await db.query("UPDATE customer_notifications SET state='failed',failure_reason=$2 WHERE id=$1",[id,error instanceof Error?error.message:'SMS delivery failed']);}
 }
}
