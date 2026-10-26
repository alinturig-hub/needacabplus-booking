import type {Discount,RewardService,TaxiMilesPolicy,VoucherRules} from './taxi-miles-policy';
export type FareContext={model:'native'|'autocab';customer:'guest'|'registered'|'member';service:RewardService;basePence:number;totalPence:number;now:string;planId?:string;pickupZone?:string;dropoffZone?:string;clear?:number;waiting?:number;signalAt?:string;quietSpentPence?:number};
export type VoucherCandidate={id:string;code:string;rules:VoucherRules;uses:number;customerUses:number;reservedPence:number;spentPence:number;source:'voucher'|'reward';enabled:boolean};
export function discountPence(discount:Discount,basePence:number,totalPence:number){
 if(![basePence,totalPence].every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('Fare amounts must be nonnegative integer pence');
 const amount=discount.type==='fixed'?Math.round(discount.value*100):Math.round((discount.type==='percentage_base'?basePence:totalPence)*discount.value/100);
 return Math.max(0,Math.min(totalPence,amount,discount.maximumAmount===null?totalPence:Math.round(discount.maximumAmount*100)));
}
export function serviceAccess(policy:TaxiMilesPolicy,customer:FareContext['customer']){return policy[customer==='guest'?'guestServices':customer==='member'?'memberServices':'registeredServices']}
export function quietDecision(policy:TaxiMilesPolicy,c:FareContext){
 const q=policy.quiet,now=Date.parse(c.now),age=now-Date.parse(c.signalAt||'');if(!Number.isFinite(now))return false;const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
 return q.enabled&&c.model==='native'&&c.customer==='member'&&c.service==='asap'&&Number.isFinite(age)&&age>=0&&age<=q.freshnessSeconds*1000&&Number.isFinite(c.clear)&&Number.isFinite(c.waiting)&&c.clear!>=q.minimumClear&&c.waiting!>=0&&c.waiting!/c.clear!<=q.maximumWaitingRatio&&(q.startHour<q.endHour?hour>=q.startHour&&hour<q.endHour:hour>=q.startHour||hour<q.endHour);
}
export function selectDiscount(policy:TaxiMilesPolicy,c:FareContext,vouchers:VoucherCandidate[]=[]){
 if(![c.basePence,c.totalPence].every(v=>Number.isSafeInteger(v)&&v>=0)||!Number.isFinite(Date.parse(c.now)))throw Error('Invalid fare context');
 if(!serviceAccess(policy,c.customer).includes(c.service))return {eligible:false,reason:'service-not-available',originalPence:c.totalPence,totalPence:c.totalPence,savingPence:0,applied:[] as {id:string;label:string;savingPence:number}[]};
 const candidates:{id:string;label:string;savingPence:number}[]=[];
 if(c.customer==='guest')return {eligible:true,reason:'account-required',originalPence:c.totalPence,totalPence:c.totalPence,savingPence:0,applied:candidates};
 const now=Date.parse(c.now);
 for(const v of vouchers){const r=v.rules;if(!v.enabled||!r.models.includes(c.model)||now<Date.parse(r.validFrom)||now>=Date.parse(r.validTo)||!r.services.includes(c.service))continue;
  if(c.customer==='member'&&(!(v.source==='voucher'?policy.voucherMemberServices:r.memberServices).includes(c.service)||!r.memberServices.includes(c.service)))continue;
  const limit=r.usageType==='single'?1:r.usageType==='multiple'?r.maximumUses:null;
  if(limit!==null&&v.uses>=limit||r.maximumUsesPerCustomer!==null&&v.customerUses>=r.maximumUsesPerCustomer)continue;
  if(r.pickupZones.length&&!r.pickupZones.includes(c.pickupZone||'')||r.dropoffZones.length&&!r.dropoffZones.includes(c.dropoffZone||''))continue;
  const saving=discountPence(r.discount,c.basePence,c.totalPence),remaining=r.budget===null?Infinity:Math.round(r.budget*100)-v.spentPence-v.reservedPence;
  // Do not silently shrink a promised reward when its budget is exhausted.
  if(saving>0&&saving<=remaining)candidates.push({id:v.id,label:v.code,savingPence:saving});
 }
 if(c.model==='native'&&c.customer==='member'){
  const plan=policy.plans.find(p=>p.id===c.planId&&p.enabled),benefit=plan?.benefits[c.service];
  if(benefit?.enabled)candidates.push({id:'membership:'+plan!.id,label:plan!.name+' membership',savingPence:discountPence(benefit.discount,c.basePence,c.totalPence)});
  if(quietDecision(policy,c)){const q=policy.quiet,saving=Math.min(discountPence(q.discount,c.basePence,c.totalPence),Math.round(q.maximumDiscount*100));if(saving<=Math.round(q.dailyBudget*100)-(c.quietSpentPence??0))candidates.push({id:'quiet',label:'Quiet-time member fare',savingPence:saving})}
 }
 candidates.sort((a,b)=>b.savingPence-a.savingPence||a.id.localeCompare(b.id));
 const chosen=policy.allowStacking&&c.model==='native'?candidates:candidates.slice(0,1);let remaining=c.totalPence;const applied=chosen.flatMap(v=>{const saving=Math.min(remaining,v.savingPence);remaining-=saving;return saving>0?[{...v,savingPence:saving}]:[]});
 return {eligible:true,reason:applied.length?'discount-applied':'no-eligible-discount',originalPence:c.totalPence,totalPence:remaining,savingPence:c.totalPence-remaining,applied};
}
export function reachedRewards(policy:TaxiMilesPolicy,miles:number,completedAt:string,alreadyAwarded:string[]=[]){
 const at=Date.parse(completedAt);return policy.campaigns.filter(c=>c.enabled&&at>=Date.parse(c.startsAt)&&at<Date.parse(c.endsAt)).flatMap(c=>c.tiers.filter(t=>miles>=t.thresholdMiles&&!alreadyAwarded.includes(c.id+':'+t.id)).map(t=>({campaignId:c.id,tierId:t.id,name:t.name,thresholdMiles:t.thresholdMiles,discount:t.discount,services:c.services,memberServices:c.memberServices,uses:t.uses,validityDays:t.validityDays})));
}
export function invitationEligible(policy:TaxiMilesPolicy,{registered,consent,lastSentAt,now}:{registered:boolean;consent:boolean;lastSentAt:string|null;now:string}){return policy.invitations.enabled&&!registered&&consent&&(!lastSentAt||Date.parse(now)-Date.parse(lastSentAt)>=policy.invitations.cooldownDays*86400000)}
export function marketingRecommendation(policy:TaxiMilesPolicy,{registered,consent,lastRideAt,lastOfferAt,offers,spentPence,now}:{registered:boolean;consent:boolean;lastRideAt:string|null;lastOfferAt:string|null;offers:number;spentPence:number;now:string}){const m=policy.marketing,at=Date.parse(now);if(!m.enabled||!registered||!consent||!lastRideAt||!Number.isFinite(Date.parse(lastRideAt))||Date.parse(lastRideAt)>at||at-Date.parse(lastRideAt)<m.inactiveDays*86400000||lastOfferAt&&at-Date.parse(lastOfferAt)<m.minimumDaysBetweenOffers*86400000||offers>=m.maximumOffersPerCustomer||spentPence>=Math.round(m.dailyBudget*100))return null;return {reason:'inactive-customer',approvalRequired:m.requireApproval,discount:{...m.discount,maximumAmount:Math.min(m.discount.maximumAmount??m.maximumDiscount,m.maximumDiscount,(Math.round(m.dailyBudget*100)-spentPence)/100)}}}
