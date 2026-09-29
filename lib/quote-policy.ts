import {z} from 'zod';
export class QuoteError extends Error{}

export const quotePolicySchema=z.preprocess(value=>{if(!value||typeof value!=='object'||Array.isArray(value))return value;const settings={...value} as Record<string,unknown>;delete settings.saloonCapabilities;delete settings.estateCapabilities;delete settings.xlCapabilities;if(settings.demandPercent===undefined&&typeof settings.highPercent==='number')settings.demandPercent=settings.highPercent;return settings},z.object({
 enabled:z.boolean().default(true),minPrebookMinutes:z.number().int().min(1).max(10080).default(30),
 priorityUpliftMode:z.enum(['percentage','fixed']).default('percentage'),guaranteeUpliftMode:z.enum(['percentage','fixed']).default('percentage'),
 priorityFixedAmount:z.number().min(0).max(1000).multipleOf(0.01).default(0),guaranteeFixedAmount:z.number().min(0).max(1000).multipleOf(0.01).default(0),
 guaranteePercent:z.number().min(0).max(100).default(20),
 dynamicPricingEnabled:z.boolean().default(false),demandPercent:z.number().min(0).max(100).default(20),
 dynamicScheduleEnabled:z.boolean().default(false),dynamicDays:z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0,1,2,3,4,5,6]),
 dynamicStartTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('00:00'),dynamicEndTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('23:59'),
 demandMode:z.enum(['manual','automatic']).default('automatic'),manualDemand:z.enum(['low','medium','high']).default('low'),
 lowPercent:z.number().min(0).max(100).default(10),mediumPercent:z.number().min(0).max(100).default(15),highPercent:z.number().min(0).max(100).default(20),
 mediumRatio:z.number().positive().max(100).default(1),highRatio:z.number().positive().max(100).default(2),
 demandWindowMinutes:z.number().int().min(1).max(120).default(15),quoteValiditySeconds:z.number().int().min(60).max(600).default(180),
 pricePath:z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/).max(100).default('outward.price'),
 priceUnit:z.enum(['gbp','pence']).default('gbp'),
}).strict().refine(v=>v.lowPercent<=v.mediumPercent&&v.mediumPercent<=v.highPercent,{message:'Priority percentages must increase from low to high demand.'}).refine(v=>v.mediumRatio<v.highRatio,{message:'High demand threshold must exceed the medium threshold.'}).refine(v=>v.demandPercent>=v.lowPercent,{message:'Demand percentage must be at least the base Priority percentage.'}));
export type QuotePolicy=z.infer<typeof quotePolicySchema>;
export const defaultQuotePolicy=quotePolicySchema.parse({});
export type Service='priority'|'guarantee';
export function validateSchedule(service:Service,scheduledAt:string|null,minimum:number,now=Date.now()){
 if(service==='priority'){if(scheduledAt)throw new QuoteError('Priority is for ASAP journeys. Choose Guarantee for prebooking.');return}
 const when=scheduledAt?Date.parse(scheduledAt):NaN;
 if(!Number.isFinite(when)||when<now+minimum*60000)throw new QuoteError(`Prebook at least ${minimum} minutes in advance.`);
 if(when>now+366*86400000)throw new QuoteError('Choose a date within the next year.');
}
export function dynamicScheduleActive(policy:QuotePolicy,now=new Date()){
 if(!policy.dynamicPricingEnabled)return false;
 if(!policy.dynamicScheduleEnabled)return true;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]));
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday),minutes=Number(parts.hour)*60+Number(parts.minute),toMinutes=(value:string)=>{const [hour,minute]=value.split(':').map(Number);return hour*60+minute},start=toMinutes(policy.dynamicStartTime),end=toMinutes(policy.dynamicEndTime);
 if(start<=end)return policy.dynamicDays.includes(day)&&minutes>=start&&minutes<=end;
 return minutes>=start?policy.dynamicDays.includes(day):minutes<=end&&policy.dynamicDays.includes((day+6)%7);
}
export function priorityPercent(policy:QuotePolicy,waiting:number|null,clear:number|null,now=new Date()){
 if(!dynamicScheduleActive(policy,now))return {level:'base',percent:policy.lowPercent};
 if(waiting!==null&&clear!==null&&waiting>clear)return {level:'demand',percent:policy.demandPercent};
 return {level:'base',percent:policy.lowPercent};
}
export function fareAdjustment(policy:QuotePolicy,service:Service,waiting:number|null,clear:number|null){
 const mode=service==='priority'?policy.priorityUpliftMode:policy.guaranteeUpliftMode;
 if(mode==='fixed')return {percent:0,fixedPence:Math.round((service==='priority'?policy.priorityFixedAmount:policy.guaranteeFixedAmount)*100),demand:'fixed'};
 const priority=priorityPercent(policy,waiting,clear);
 return {percent:service==='priority'?priority.percent:policy.guaranteePercent,fixedPence:0,demand:service==='priority'?priority.level:'prebook'};
}
export function fareBreakdown(basePence:number,percent:number,fixedPence=0){
 if(!Number.isSafeInteger(basePence)||basePence<=0||basePence>1000000)throw new QuoteError('Autocab did not return a valid fare.');
 if(!Number.isFinite(percent)||percent<0||percent>100||!Number.isSafeInteger(fixedPence)||fixedPence<0||fixedPence>100000)throw new QuoteError('Invalid fare adjustment.');
 if(percent>0&&fixedPence>0)throw new QuoteError('Choose percentage or fixed addition, not both.');
 const upliftPence=Math.round(basePence*percent/100)+fixedPence;
 return {basePence,upliftPence,totalPence:basePence+upliftPence};
}
export function readFare(payload:unknown,path:string,unit:'gbp'|'pence'){
 let value:unknown=payload;
 for(const part of path.split('.'))value=value&&typeof value==='object'?Object.entries(value).find(([key])=>key.toLowerCase()===part.toLowerCase())?.[1]:undefined;
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw new QuoteError('Autocab did not return a usable passenger fare. Please try again or contact support.');
 const pence=unit==='gbp'?Math.round(value*100):value;
 return fareBreakdown(pence,0).basePence;
}
