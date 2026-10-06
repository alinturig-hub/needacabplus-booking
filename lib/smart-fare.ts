import type {QuotePolicy,Service} from './quote-policy';

export type SmartSignal={waiting:number|null;clear:number|null;fresh:boolean};
export function smartFareDecision(policy:QuotePolicy,signal:SmartSignal){
 if(policy.smartFareMode==='off')return {quiet:false,reason:'disabled'};
 if(!signal.fresh||signal.waiting===null||signal.clear===null)return {quiet:false,reason:'stale-or-unavailable'};
 if(signal.clear<policy.smartFareMinClear)return {quiet:false,reason:'insufficient-clear-cars'};
 if(signal.waiting/signal.clear>policy.smartFareMaxWaitingRatio)return {quiet:false,reason:'normal-demand'};
 if(!policy.smartFareCapabilities.length)return {quiet:false,reason:'no-discount-capabilities'};
 return {quiet:true,reason:'quiet'};
}

export function serviceCapabilities(policy:QuotePolicy,common:number[],service:Service,discount=false){
 // Discount-only IDs must never leak from the old global selection. An explicit
 // service selection can still opt Priority, Pre-book or Guarantee into it.
 const discountOnly=new Set([42,...policy.smartFareCapabilities]);
 return [...new Set([...common.filter(id=>!discountOnly.has(id)),...policy.serviceCapabilities[service],...(service==='asap'&&discount?policy.smartFareCapabilities:[])])];
}
