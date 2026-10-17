import type {MembershipTierId,QuotePolicy} from './quote-policy';
export type MembershipRecord={tier_id:string;status:string;starts_at:Date|string;ends_at:Date|string|null;grace_ends_at:Date|string|null;operator_access_until?:Date|string|null};
export function membershipEntitlement(row:MembershipRecord|undefined,policy:QuotePolicy,now=Date.now()){
 if(!row||new Date(row.starts_at).getTime()>now||!Number.isFinite(new Date(row.starts_at).getTime())||(row.ends_at!==null&&(!Number.isFinite(new Date(row.ends_at).getTime())||new Date(row.ends_at).getTime()<=now)))return null;
 const tierId=row.tier_id as MembershipTierId;
 if(!Object.hasOwn(policy.membership.tiers,tierId))return null;
 const tier=policy.membership.tiers[tierId];
 if(!tier.enabled)return null;
 const active=row.status==='active'||(row.status==='grace_period'&&policy.membership.dunning.keepBenefitsDuringGrace&&row.grace_ends_at!==null&&new Date(row.grace_ends_at).getTime()>now);
 if(!active)return null;
 const testAccessUntil=row.operator_access_until?new Date(row.operator_access_until).getTime():NaN;
 if(row.status==='active'&&Number.isFinite(testAccessUntil)&&testAccessUntil>now)return {tierId,tierName:tier.name,testAccessUntil:new Date(testAccessUntil).toISOString()};
 if(!policy.membership.enabled||tier.monthlyPrice<=0)return null;
 return {tierId,tierName:tier.name};
}
