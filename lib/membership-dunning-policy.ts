import type {QuotePolicy} from './quote-policy';

export type DunningDecision={status:'grace_period'|'cancelled';failedPaymentCount:number;failedAt:Date;graceEndsAt:Date;cancel:boolean};

export function paymentFailureDecision(policy:QuotePolicy['membership']['dunning'],previousFailures:number,firstFailure:Date|null,now=new Date()):DunningDecision{
 const failedPaymentCount=Math.max(0,previousFailures)+1;
 const failedAt=firstFailure||now;
 const graceEndsAt=new Date(failedAt.getTime()+policy.gracePeriodDays*86400000);
 const cancel=policy.cancelAfterFinalFailure&&(failedPaymentCount>=policy.maxFailedPayments||graceEndsAt.getTime()<=now.getTime());
 return {status:cancel?'cancelled':'grace_period',failedPaymentCount,failedAt,graceEndsAt,cancel};
}

export function membershipMessage(template:string,values:{tier:string;graceEnd?:Date}){
 return template.replaceAll('{tier}',values.tier).replaceAll('{graceEnd}',values.graceEnd?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(values.graceEnd):'');
}
