import {z} from 'zod';
export class QuoteError extends Error{}

export const quotePolicySchema=z.object({
 enabled:z.boolean().default(true),minPrebookMinutes:z.number().int().min(1).max(10080).default(30),
 guaranteePercent:z.number().min(0).max(100).default(20),
 demandMode:z.enum(['manual','automatic']).default('automatic'),manualDemand:z.enum(['low','medium','high']).default('low'),
 lowPercent:z.number().min(0).max(100).default(10),mediumPercent:z.number().min(0).max(100).default(15),highPercent:z.number().min(0).max(100).default(20),
 mediumRatio:z.number().positive().max(100).default(1),highRatio:z.number().positive().max(100).default(2),
 demandWindowMinutes:z.number().int().min(1).max(120).default(15),quoteValiditySeconds:z.number().int().min(60).max(600).default(180),
 pricePath:z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/).max(100).default('price'),
 priceUnit:z.enum(['gbp','pence']).default('gbp'),
 estateCapabilities:z.array(z.number().int().nonnegative()).max(20).default([]),xlCapabilities:z.array(z.number().int().nonnegative()).max(20).default([]),
}).strict().refine(v=>v.lowPercent<=v.mediumPercent&&v.mediumPercent<=v.highPercent,{message:'Priority percentages must increase from low to high demand.'}).refine(v=>v.mediumRatio<v.highRatio,{message:'High demand threshold must exceed the medium threshold.'});
export type QuotePolicy=z.infer<typeof quotePolicySchema>;
export const defaultQuotePolicy=quotePolicySchema.parse({});
export type Service='priority'|'guarantee';
export function validateSchedule(service:Service,scheduledAt:string|null,minimum:number,now=Date.now()){
 if(service==='priority'){if(scheduledAt)throw new QuoteError('Priority is for ASAP journeys. Choose Guarantee for prebooking.');return}
 const when=scheduledAt?Date.parse(scheduledAt):NaN;
 if(!Number.isFinite(when)||when<now+minimum*60000)throw new QuoteError(`Prebook at least ${minimum} minutes in advance.`);
 if(when>now+366*86400000)throw new QuoteError('Choose a date within the next year.');
}
export function priorityPercent(policy:QuotePolicy,waiting:number|null,clear:number|null){
 let level=policy.manualDemand;
 if(policy.demandMode==='automatic'&&waiting!==null&&clear!==null){const ratio=clear===0?(waiting>0?Infinity:0):waiting/clear;level=ratio>=policy.highRatio?'high':ratio>=policy.mediumRatio?'medium':'low'}
 return {level,percent:policy[`${level}Percent`]};
}
export function fareBreakdown(basePence:number,percent:number){
 if(!Number.isSafeInteger(basePence)||basePence<=0||basePence>1000000)throw new QuoteError('Autocab did not return a valid fare.');
 const upliftPence=Math.round(basePence*percent/100);
 return {basePence,upliftPence,totalPence:basePence+upliftPence};
}
export function readFare(payload:unknown,path:string,unit:'gbp'|'pence'){
 let value:unknown=payload;
 for(const part of path.split('.'))value=value&&typeof value==='object'?Object.entries(value).find(([key])=>key.toLowerCase()===part.toLowerCase())?.[1]:undefined;
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0){
  // Field names only: do not expose upstream amounts, identifiers or personal data.
  const paths:string[]=[];const walk=(item:unknown,prefix:string,depth:number)=>{if(depth>5||paths.length>=25)return;if(item&&typeof item==='object'){for(const [key,nested] of Object.entries(item)){if(!/^[A-Za-z0-9_]+$/.test(key))continue;walk(nested,prefix?`${prefix}.${key}`:key,depth+1)}}else paths.push(`${prefix}:${typeof item}`)};walk(payload,'',0);
  throw new QuoteError(`Autocab fare mapping needs configuration. Response fields: ${paths.join(', ')}`);
 }
 const pence=unit==='gbp'?Math.round(value*100):value;
 return fareBreakdown(pence,0).basePence;
}
