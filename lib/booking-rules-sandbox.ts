import {bookingServiceAccess,type BookingPolicy} from './booking-policy';
import {fareAdjustment,fareBreakdown,membershipAddonPercent,type MembershipTierId,type QuotePolicy,type Service} from './quote-policy';
import {smartFareDecision} from './smart-fare';

export type BookingSandboxInput={service:Service;tierId:MembershipTierId|null;basePence:number;candidatePence:number;waiting:number;clear:number;miles:number};

export function simulateBookingRules(rules:BookingPolicy,policy:QuotePolicy,input:BookingSandboxInput){
 const tier=input.tierId?policy.membership.tiers[input.tierId]:null;
 const paidMember=Boolean(policy.membership.enabled&&tier?.enabled&&tier.monthlyPrice>0);
 const access=bookingServiceAccess(rules,paidMember);
 const allowed=access[input.service];
 const signal={waiting:input.waiting,clear:input.clear,fresh:true};
 const quiet=smartFareDecision(policy,signal);
 const discountAvailable=input.service==='asap'&&access.quietAsap&&quiet.quiet&&policy.smartFareMode==='live'&&input.candidatePence<input.basePence;
 const selectedBasePence=discountAvailable?input.candidatePence:input.basePence;
 const adjustment=fareAdjustment(policy,input.service,input.waiting,input.clear);
 const standard=fareBreakdown(selectedBasePence,adjustment.percent,adjustment.fixedPence);
 const memberPercent=membershipAddonPercent(policy,paidMember?input.tierId:null,input.service);
 const discounted=memberPercent===null?null:fareBreakdown(selectedBasePence,memberPercent);
 const membershipDiscount=Boolean(discounted&&discounted.totalPence<standard.totalPence);
 const totalPence=membershipDiscount?discounted!.totalPence:standard.totalPence;
 const loyaltyEligible=access.loyalty&&policy.loyalty.enabled&&allowed;
 const loyaltyPoints=loyaltyEligible?Math.max(0,Math.floor(policy.loyalty.pointsPerCompletedRide+input.miles*policy.loyalty.pointsPerMile)):0;
 return {paidMember,allowed,access,quiet,discountAvailable,selectedBasePence,standardTotalPence:standard.totalPence,totalPence,membershipSavingPence:membershipDiscount?standard.totalPence-totalPence:0,loyaltyPoints};
}
