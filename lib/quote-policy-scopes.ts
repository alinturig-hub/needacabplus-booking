import {quotePolicySchema,type QuotePolicy} from './quote-policy';

export type QuotePolicyScope='autocab'|'shared';

const autocabFields=new Set<keyof QuotePolicy>(['enabled','pricePath','priceUnit','smartFareCapabilities','serviceCapabilities']);

export function mergeQuotePolicyScope(current:QuotePolicy,incoming:QuotePolicy,scope:QuotePolicyScope){
 const patch=Object.fromEntries(Object.entries(incoming).filter(([key])=>key!=='minPrebookMinutes'&&(scope==='autocab'?autocabFields.has(key as keyof QuotePolicy):!autocabFields.has(key as keyof QuotePolicy))));
 return quotePolicySchema.parse({...current,...patch});
}
