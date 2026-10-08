import {headers} from 'next/headers';
import type Stripe from 'stripe';
import {database} from '@/lib/database';
import {stripeConfiguration} from '@/lib/stripe';
import {loadQuotePolicy} from '@/lib/quotes';
import {membershipTierIds,type MembershipTierId} from '@/lib/quote-policy';
import {membershipMessage,paymentFailureDecision,sendMembershipNotifications} from '@/lib/membership-dunning';

export const dynamic='force-dynamic';

function objectRecord(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null}
function stripeId(value:unknown){if(typeof value==='string')return value;const record=objectRecord(value);return typeof record?.id==='string'?record.id:null}
function invoiceSubscription(invoice:unknown){const record=objectRecord(invoice),direct=stripeId(record?.subscription);if(direct)return direct;const parent=objectRecord(record?.parent),details=objectRecord(parent?.subscription_details);return stripeId(details?.subscription)}
function validTier(value:unknown):value is MembershipTierId{return typeof value==='string'&&(membershipTierIds as readonly string[]).includes(value)}
function subscriptionStatus(value:string){return value==='active'||value==='trialing'?value:value==='canceled'||value==='unpaid'?'cancelled':'past_due'}

type Notice={customerId:string;phone:string;tier:string;category:'membership_payment_failed'|'membership_cancelled'|'membership_recovered';message:string};

async function processMembershipEvent(event:Stripe.Event){
 const policy=(await loadQuotePolicy()).membership,db=await database().connect();let notice:Notice|null=null;
 try{
  await db.query('BEGIN');
  const claimed=await db.query(`INSERT INTO membership_payment_events(stripe_event_id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING stripe_event_id`,[event.id,event.type]);
  if(!claimed.rowCount){await db.query('ROLLBACK');return {duplicate:true,notice:null};}
  const object=event.data.object as unknown,record=objectRecord(object);
  if(event.type==='customer.subscription.created'||event.type==='customer.subscription.updated'||event.type==='customer.subscription.deleted'){
   const subscriptionId=stripeId(object),customerStripeId=stripeId(record?.customer),metadata=objectRecord(record?.metadata),tierId=metadata?.tierId;
   const customer=customerStripeId?(await db.query<{id:string;phone:string}>(`SELECT id,phone FROM customer_accounts WHERE stripe_customer_id=$1 UNION ALL SELECT account.id,account.phone FROM customer_stripe_profiles profile JOIN customer_accounts account ON account.id=profile.customer_id WHERE profile.stripe_customer_id=$1 LIMIT 1`,[customerStripeId])).rows[0]:null;
   if(subscriptionId&&customer&&validTier(tierId)){
    const status=event.type==='customer.subscription.deleted'?'cancelled':subscriptionStatus(String(record?.status||''));
    const periodEnd=typeof record?.current_period_end==='number'?new Date(record.current_period_end*1000):null;
    await db.query(`INSERT INTO customer_memberships(customer_id,tier_id,status,stripe_subscription_id,renews_at,ends_at,updated_at)
     VALUES($1,$2,$3,$4,$5,CASE WHEN $3='cancelled' THEN now() END,now()) ON CONFLICT(customer_id) DO UPDATE SET tier_id=EXCLUDED.tier_id,status=CASE WHEN customer_memberships.status='grace_period' AND EXCLUDED.status='past_due' THEN customer_memberships.status ELSE EXCLUDED.status END,stripe_subscription_id=EXCLUDED.stripe_subscription_id,renews_at=EXCLUDED.renews_at,ends_at=EXCLUDED.ends_at,updated_at=now()`,[customer.id,tierId,status,subscriptionId,periodEnd]);
    await db.query('UPDATE membership_payment_events SET stripe_subscription_id=$2,customer_id=$3,outcome=$4 WHERE stripe_event_id=$1',[event.id,subscriptionId,customer.id,status]);
   }else await db.query("UPDATE membership_payment_events SET outcome='ignored_no_customer_or_tier' WHERE stripe_event_id=$1",[event.id]);
  }else if(event.type==='invoice.payment_failed'){
   const subscriptionId=invoiceSubscription(object),invoiceId=stripeId(object);
   const membership=subscriptionId?(await db.query<{customer_id:string;tier_id:MembershipTierId;status:string;failed_payment_count:number;payment_failed_at:Date|null;phone:string}>(`SELECT membership.customer_id,membership.tier_id,membership.status,membership.failed_payment_count,membership.payment_failed_at,customer.phone FROM customer_memberships membership JOIN customer_accounts customer ON customer.id=membership.customer_id WHERE membership.stripe_subscription_id=$1 FOR UPDATE OF membership`,[subscriptionId])).rows[0]:null;
   if(membership){
    const tier=policy.tiers[membership.tier_id],decision=paymentFailureDecision(policy.dunning,membership.failed_payment_count,membership.payment_failed_at);
    const status=policy.dunning.enabled?decision.status:'past_due';
    await db.query(`UPDATE customer_memberships SET status=$2,payment_failed_at=$3,grace_ends_at=$4,failed_payment_count=$5,last_invoice_id=$6,ends_at=CASE WHEN $2='cancelled' THEN now() ELSE ends_at END,cancellation_reason=CASE WHEN $2='cancelled' THEN 'payment_failed' ELSE NULL END,updated_at=now() WHERE customer_id=$1`,[membership.customer_id,status,decision.failedAt,decision.graceEndsAt,decision.failedPaymentCount,invoiceId]);
    await db.query('UPDATE membership_payment_events SET stripe_subscription_id=$2,customer_id=$3,outcome=$4 WHERE stripe_event_id=$1',[event.id,subscriptionId,membership.customer_id,status]);
    const cancelled=status==='cancelled';notice={customerId:membership.customer_id,phone:membership.phone,tier:tier.name,category:cancelled?'membership_cancelled':'membership_payment_failed',message:membershipMessage(cancelled?policy.dunning.cancelledMessage:policy.dunning.failedPaymentMessage,{tier:tier.name,graceEnd:decision.graceEndsAt})};
   }else await db.query("UPDATE membership_payment_events SET stripe_subscription_id=$2,outcome='ignored_unknown_subscription' WHERE stripe_event_id=$1",[event.id,subscriptionId]);
  }else if(event.type==='invoice.payment_succeeded'){
   const subscriptionId=invoiceSubscription(object);
   const membership=subscriptionId?(await db.query<{customer_id:string;tier_id:MembershipTierId;status:string;phone:string}>(`SELECT membership.customer_id,membership.tier_id,membership.status,customer.phone FROM customer_memberships membership JOIN customer_accounts customer ON customer.id=membership.customer_id WHERE membership.stripe_subscription_id=$1 FOR UPDATE OF membership`,[subscriptionId])).rows[0]:null;
   if(membership){
    const recovered=!['active','trialing'].includes(membership.status),tier=policy.tiers[membership.tier_id];
    await db.query(`UPDATE customer_memberships SET status='active',payment_failed_at=NULL,grace_ends_at=NULL,failed_payment_count=0,last_invoice_id=NULL,ends_at=NULL,cancellation_reason=NULL,updated_at=now() WHERE customer_id=$1`,[membership.customer_id]);
    await db.query("UPDATE membership_payment_events SET stripe_subscription_id=$2,customer_id=$3,outcome='active' WHERE stripe_event_id=$1",[event.id,subscriptionId,membership.customer_id]);
    if(recovered)notice={customerId:membership.customer_id,phone:membership.phone,tier:tier.name,category:'membership_recovered',message:membershipMessage(policy.dunning.recoveredMessage,{tier:tier.name})};
   }else await db.query("UPDATE membership_payment_events SET stripe_subscription_id=$2,outcome='ignored_unknown_subscription' WHERE stripe_event_id=$1",[event.id,subscriptionId]);
  }else await db.query("UPDATE membership_payment_events SET outcome='ignored_event_type' WHERE stripe_event_id=$1",[event.id]);
  await db.query('COMMIT');return {duplicate:false,notice};
 }catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
}

export async function POST(request:Request){
 try{
  const signature=(await headers()).get('stripe-signature');if(!signature)return Response.json({error:'Missing Stripe signature.'},{status:400});
  const payload=await request.text(),{stripe,webhookSecret}=await stripeConfiguration();if(!webhookSecret)return Response.json({error:'Stripe webhook secret is not configured.'},{status:503});
  const event=stripe.webhooks.constructEvent(payload,signature,webhookSecret),result=await processMembershipEvent(event);
  if(result.notice){const dunning=(await loadQuotePolicy()).membership.dunning;await sendMembershipNotifications({...result.notice,eventId:event.id,channels:{inApp:dunning.notifyInApp,sms:dunning.notifySms,email:dunning.notifyEmail}})}
  return Response.json({received:true,duplicate:result.duplicate});
 }catch(error){console.error('Stripe webhook failure',error);return Response.json({error:'Invalid Stripe webhook.'},{status:400})}
}
