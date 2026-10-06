import {z} from 'zod';
import {serviceCapabilities} from '@/lib/smart-fare';
import {loadBookingPolicy} from '@/lib/app-configuration';
import {bookingQuote} from '@/lib/autocab-api';
import {readAutocabCosts} from '@/lib/autocab-booking-request';
import {buildAutocabQuoteRequest} from '@/lib/autocab-quote-request';
import {firstPrebookTime} from '@/lib/prebook-time';
import {loadQuotePolicy} from '@/lib/quotes';
import {readFare} from '@/lib/quote-policy';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const fullAddress=z.object({text:z.string().trim().min(1).max(500),coordinate:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).passthrough(),zoneId:z.number().int().nonnegative()}).passthrough();
const selectedAddress=z.object({address:z.string().trim().min(1).max(500),fullAddress,placeID:z.string().nullable().optional(),customAddressID:z.union([z.string(),z.number()]).nullable().optional()}).strict();
const inputSchema=z.object({
 capabilityId:z.number().int().positive().max(1000000).nullable().optional(),
 pickup:selectedAddress,destination:selectedAddress,
 service:z.enum(['asap','priority','guarantee']).default('asap'),paymentMethod:z.enum(['cash','card']).default('cash'),
}).strict().refine(value=>value.pickup.address.toLowerCase()!==value.destination.address.toLowerCase(),{message:'Use two different addresses.'});
type JsonRecord=Record<string,unknown>;
function record(value:unknown):JsonRecord{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{}}
function scalar(value:unknown){return typeof value==='string'||typeof value==='number'||typeof value==='boolean'?value:null}
function tariffEvidence(value:unknown,depth=0):Record<string,string|number|boolean>{
 if(depth>5)return {};const found:Record<string,string|number|boolean>={};
 if(Array.isArray(value)){for(const item of value)Object.assign(found,tariffEvidence(item,depth+1));return found}
 for(const [key,nested] of Object.entries(record(value))){
  if(['tariff','tariffid','tariffname','pricingtariff','pricingtariffid'].includes(key.toLowerCase())){const item=scalar(nested);if(item!==null)found[key]=item}
  else if(nested&&typeof nested==='object')Object.assign(found,tariffEvidence(nested,depth+1));
 }
 return found;
}
function addressLabel(value:JsonRecord,fallback:string){for(const key of ['text','displayName','formattedAddress','address']){const item=value[key];if(typeof item==='string'&&item.trim())return item}return fallback}
function quoteResult(response:unknown,capabilities:number[],policy:Awaited<ReturnType<typeof loadQuotePolicy>>){
 const costs=readAutocabCosts(response);
 return {ok:true as const,capabilities,pricePence:readFare(response,policy.pricePath,policy.priceUnit),cost:costs?.cost??null,bookingCost:costs?.bookingCost??null,tariff:tariffEvidence(response)};
}
function quoteError(reason:unknown,capabilities:number[]){return {ok:false as const,capabilities,error:reason instanceof Error?reason.message:'Autocab did not return a quote.'}}
function settledResult(result:PromiseSettledResult<unknown>,capabilities:number[],policy:Awaited<ReturnType<typeof loadQuotePolicy>>){
 if(result.status==='rejected')return quoteError(result.reason,capabilities);
 try{return quoteResult(result.value,capabilities,policy)}catch(error){return quoteError(error,capabilities)}
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const parsed=inputSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:parsed.error.issues[0].message},{status:400});
 try{
  const input=parsed.data,rules=await loadBookingPolicy(),policy=await loadQuotePolicy(),pickup=input.pickup.fullAddress,destination=input.destination.fullAddress;
  const scheduledAt=input.service==='guarantee'?new Date(firstPrebookTime(rules.minPrebookMinutes)).toISOString():null;
  if(input.capabilityId==null){
   const quoteRules={...rules,paymentMethod:input.paymentMethod,bookingCapabilities:[],...(input.service==='asap'?{priorityDelayMinutes:0}:{})};
   const request=buildAutocabQuoteRequest({pickup,destination,vias:[],vehicle:'saloon',scheduledAt},[],new Date(),quoteRules);
   const [result]=await Promise.allSettled([bookingQuote(request)]);
   return Response.json({testOnly:true,bookingCreated:false,capabilityId:null,service:input.service,paymentMethod:input.paymentMethod,scheduledAt,resolved:{pickup:addressLabel(pickup,input.pickup.address),destination:addressLabel(destination,input.destination.address)},control:settledResult(result,[],policy)},{headers:{'Cache-Control':'no-store'}});
  }
  const common=serviceCapabilities(policy,rules.bookingCapabilities,input.service).filter(id=>id!==input.capabilityId),controlRules={...rules,paymentMethod:input.paymentMethod,bookingCapabilities:common,...(input.service==='asap'?{priorityDelayMinutes:0}:{})},discountRules={...controlRules,bookingCapabilities:[...common,input.capabilityId]};
  const journey={pickup,destination,vias:[],vehicle:'saloon',scheduledAt};
  const controlRequest=buildAutocabQuoteRequest(journey,common,new Date(),controlRules),discountRequest=buildAutocabQuoteRequest(journey,discountRules.bookingCapabilities,new Date(),discountRules);
  const [control,discounted]=await Promise.allSettled([bookingQuote(controlRequest),bookingQuote(discountRequest)]);
  return Response.json({
   testOnly:true,bookingCreated:false,capabilityId:input.capabilityId,service:input.service,paymentMethod:input.paymentMethod,scheduledAt,
   resolved:{pickup:addressLabel(pickup,input.pickup.address),destination:addressLabel(destination,input.destination.address)},
   control:settledResult(control,common,policy),
   discounted:settledResult(discounted,discountRules.bookingCapabilities,policy),
  },{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
