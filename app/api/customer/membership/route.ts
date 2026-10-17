import {z} from 'zod';
import {database} from '@/lib/database';
import {getCustomer} from '@/lib/customer-auth';
import {sameOrigin} from '@/lib/security';
import {membershipEntitlement,type MembershipRecord} from '@/lib/membership-entitlement';
import {loadQuotePolicy} from '@/lib/quotes';
import {loadBookingPolicy} from '@/lib/app-configuration';

export const dynamic='force-dynamic';

export async function GET(){
 const customer=await getCustomer();if(!customer)return Response.json({error:'Authentication required.'},{status:401});
 const [policy,bookingPolicy,membership,loyalty,notifications]=await Promise.all([
  loadQuotePolicy(),
  loadBookingPolicy(),
  database().query<MembershipRecord&{renews_at:string|null;failed_payment_count:number}>(`SELECT tier_id,status,starts_at,ends_at,operator_access_until,renews_at,grace_ends_at,failed_payment_count FROM customer_memberships WHERE customer_id=$1`,[customer.id]),
  database().query<{points_balance:string;lifetime_points:string}>(`SELECT points_balance,lifetime_points FROM customer_loyalty_accounts WHERE customer_id=$1`,[customer.id]),
  database().query<{id:string;category:string;title:string;message:string;created_at:string;read_at:string|null}>(`SELECT id,category,title,message,created_at,read_at FROM customer_notifications WHERE customer_id=$1 AND channel='in_app' AND state='sent' ORDER BY created_at DESC LIMIT 10`,[customer.id]),
 ]);
 const row=membership.rows[0],tier=row?.tier_id&&Object.hasOwn(policy.membership.tiers,row.tier_id)?policy.membership.tiers[row.tier_id as keyof typeof policy.membership.tiers]:null;
 const entitlement=membershipEntitlement(row,policy),benefitsActive=Boolean(entitlement);
 const plans=policy.membership.enabled?Object.entries(policy.membership.tiers).filter(([,item])=>item.enabled&&item.monthlyPrice>0).map(([id,item])=>({id,name:item.name,pricePence:Math.round(item.monthlyPrice*100),priorityAddonPercent:item.priorityAddonPercent,guaranteeAddonPercent:item.guaranteeAddonPercent})):[];
 return Response.json({membership:{tierId:benefitsActive?row.tier_id:null,tierName:benefitsActive&&tier?tier.name:'Non-member',status:row?.status||'non_member',benefitsActive,renewsAt:row?.renews_at||null,graceEndsAt:row?.grace_ends_at||null,failedPaymentCount:row?.failed_payment_count||0,testAccessUntil:entitlement?.testAccessUntil||null,pricePence:benefitsActive&&tier&&!entitlement?.testAccessUntil?Math.round(tier.monthlyPrice*100):null},plans,billingInterval:policy.membership.billingInterval,benefits:{priority:bookingPolicy.priorityRequiresPaidMembership,guarantee:bookingPolicy.guaranteeRequiresPaidMembership,quietAsap:bookingPolicy.quietAsapRequiresPaidMembership,loyalty:bookingPolicy.loyaltyRequiresPaidMembership},loyalty:{pointsBalance:Number(loyalty.rows[0]?.points_balance||0),lifetimePoints:Number(loyalty.rows[0]?.lifetime_points||0)},notifications:notifications.rows},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});const customer=await getCustomer();if(!customer)return Response.json({error:'Authentication required.'},{status:401});
 const parsed=z.object({notificationId:z.string().uuid()}).strict().safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:'Invalid notification.'},{status:400});
 await database().query(`UPDATE customer_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND customer_id=$2 AND channel='in_app'`,[parsed.data.notificationId,customer.id]);return Response.json({ok:true});
}
