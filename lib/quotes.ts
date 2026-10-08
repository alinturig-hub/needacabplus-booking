import {selectPaymentMethod} from './booking-payments';
import {loadBookingPolicy} from './app-configuration';
import type {BookingPolicy} from './booking-policy';
import {autocabTime} from '@/lib/autocab-time.mjs';
import {buildAutocabQuoteRequest} from './autocab-quote-request';
import {publicFareQuote} from './quote-presentation';
import {readAutocabCosts} from './autocab-booking-request';
import {randomUUID} from 'node:crypto';
import {signQuote} from './quote-token';
import {serviceCapabilities,smartFareDecision,type SmartSignal} from './smart-fare';
export {verifyQuote} from './quote-token';
import {z} from 'zod';
import {database} from './database';
import {bookingQuote} from './autocab-api';
import {publicClearVehicles} from './live-drivers';
import {QuoteError,quotePolicySchema,dynamicScheduleActive,fareAdjustment,membershipAddonPercent,readFare,fareBreakdown,validateSchedule,type MembershipTierId,type QuotePolicy,type Service} from './quote-policy';

const address=z.object({text:z.string().trim().min(5).max(250),coordinate:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).passthrough(),zoneId:z.number().int().nonnegative()}).passthrough();
export const quoteRequestSchema=z.object({pickup:address,destination:address,vias:z.array(address).max(3),vehicle:z.enum(['saloon','estate','xl']),service:z.enum(['asap','priority','prebook','guarantee']),paymentMethod:z.enum(['cash','card']).optional(),scheduledAt:z.string().datetime().nullable()}).strict();
export type FareQuote={id:string;vehicle:string;service:Service;scheduledAt:string|null;pickup:string;destination:string;vias:string[];basePence:number;upliftPence:number;fixedPence?:number;totalPence:number;percent:number;demand:string;expiresAt:string;currency:'GBP';liveBooking?:boolean;bookingRules?:BookingPolicy;paymentMethod?:'card'|'cash';autocabRequest?:ReturnType<typeof buildAutocabQuoteRequest>;autocabCosts?:{cost:number;bookingCost:number};smartFare?:{applied:boolean;reason:string;normalPence:number;candidatePence?:number;signal:SmartSignal};membership?:ActiveMembership&{standardTotalPence:number;savingPence:number}};
type ActiveMembership={tierId:MembershipTierId;tierName:string};
async function activeMembership(customerId:string|null,policy:QuotePolicy):Promise<ActiveMembership|null>{
 if(!customerId||!policy.membership.enabled)return null;
 const result=await database().query<{tier_id:string}>(`SELECT tier_id FROM customer_memberships
  WHERE customer_id=$1 AND (status IN ('active','trialing') OR (status='grace_period' AND $2::boolean=true AND grace_ends_at>now())) AND starts_at<=now()
  AND (ends_at IS NULL OR ends_at>now()) ORDER BY updated_at DESC LIMIT 1`,[customerId,policy.membership.dunning.keepBenefitsDuringGrace]);
 const tierId=result.rows[0]?.tier_id as MembershipTierId|undefined;
 if(!tierId||!Object.hasOwn(policy.membership.tiers,tierId)||!policy.membership.tiers[tierId].enabled)return null;
 return {tierId,tierName:policy.membership.tiers[tierId].name};
}
export async function loadQuotePolicy(){const result=await database().query("SELECT settings->'liveQuotes' AS policy FROM operations_settings WHERE id='pricing'");const rules=await loadBookingPolicy();return quotePolicySchema.parse({...result.rows[0]?.policy,minPrebookMinutes:rules.minPrebookMinutes})}
export async function demandSnapshot(policy:Awaited<ReturnType<typeof loadQuotePolicy>>){
 if(!policy.dynamicPricingEnabled)return {waiting:null,clear:null,mode:'disabled'};
 if(!dynamicScheduleActive(policy))return {waiting:null,clear:null,mode:'scheduled-off'};
 const [cars,result,fresh]=await Promise.all([publicClearVehicles(),database().query("SELECT pickup_data,timeline_data FROM bookings WHERE status IN ('Booked','Created','Modified','Running Late') AND COALESCE(driver_data->>'id',driver_data->>'driverId','')=''"),database().query('SELECT max(recorded_at) AS latest FROM driver_positions')]);
 if(!fresh.rows[0]?.latest||Date.now()-new Date(fresh.rows[0].latest).getTime()>120000)return {waiting:null,clear:null,mode:'manual-fallback'};
 const now=Date.now(),window=policy.demandWindowMinutes*60000;
 const waiting=result.rows.filter(row=>{const due=autocabTime(row.timeline_data?.scheduledAt||row.pickup_data?.dueTime||'');return Number.isFinite(due)&&due>=now-window&&due<=now+window}).length;
 return {waiting,clear:cars.length,mode:'automatic'};
}
export async function smartFareSnapshot(policy:Awaited<ReturnType<typeof loadQuotePolicy>>):Promise<SmartSignal>{
 if(policy.smartFareMode==='off')return {waiting:null,clear:null,fresh:false};
 try{
  const [cars,bookings,feed]=await Promise.all([
   publicClearVehicles(),
   database().query("SELECT pickup_data,timeline_data FROM bookings WHERE lower(status) IN ('booked','created','modified','running late') AND COALESCE(driver_data->>'id',driver_data->>'driverId','')=''"),
   database().query('SELECT max(updated_at) AS latest FROM bookings WHERE last_event_type IS NOT NULL AND external_booking_id IS NOT NULL'),
  ]);
  const now=Date.now(),age=now-new Date(feed.rows[0]?.latest||0).getTime(),maxAge=policy.smartFareFreshnessSeconds*1000;
  const clear=cars.filter(car=>{const elapsed=now-Date.parse(car.recordedAt);return elapsed>=0&&elapsed<=maxAge}).length;
  if(!Number.isFinite(age)||age<0||age>maxAge)return {waiting:null,clear,fresh:false};
  // Include overdue jobs and unknown due times conservatively: neither is evidence of quiet demand.
  const waiting=bookings.rows.filter(row=>{const due=autocabTime(row.timeline_data?.scheduledAt||row.pickup_data?.dueTime||'');return !Number.isFinite(due)||due<=now+policy.demandWindowMinutes*60000}).length;
  return {waiting,clear,fresh:true};
 }catch{return {waiting:null,clear:null,fresh:false}}
}
export async function calculateQuote(input:z.infer<typeof quoteRequestSchema>,customerId:string|null=null):Promise<FareQuote>{
 const policy=await loadQuotePolicy();if(!policy.enabled)throw new QuoteError('Live quotes are currently unavailable.');
 validateSchedule(input.service,input.scheduledAt,policy.minPrebookMinutes);
 const stops=[input.pickup,...input.vias,input.destination];if(new Set(stops.map(stop=>stop.text.toLowerCase())).size!==stops.length)throw new QuoteError('Choose a different address for each stop.');
 if(input.vehicle!=='saloon')throw new QuoteError('This vehicle category is not available for quoting yet. Choose Plus Saloon.');
 const savedRules=await loadBookingPolicy();let paymentMethod:'cash'|'card';try{paymentMethod=selectPaymentMethod(savedRules,input.paymentMethod)}catch(e){throw new QuoteError(e instanceof Error?e.message:'Payment is unavailable.')}
 let bookingRules={...savedRules,paymentMethod,bookingCapabilities:serviceCapabilities(policy,savedRules.bookingCapabilities,input.service),...(input.service==='asap'?{priorityDelayMinutes:0}:{})};
 const quoteTime=new Date();
 let autocabRequest=buildAutocabQuoteRequest(input,bookingRules.bookingCapabilities,quoteTime,bookingRules);
 const signal=input.service==='asap'?await smartFareSnapshot(policy):null;
 const decision=signal?smartFareDecision(policy,signal):null;
 const discountedRules=decision?.quiet?{...bookingRules,bookingCapabilities:serviceCapabilities(policy,savedRules.bookingCapabilities,'asap',true)}:null;
 const discountedRequest=discountedRules?buildAutocabQuoteRequest(input,discountedRules.bookingCapabilities,quoteTime,discountedRules):null;
 const [normalResult,discountedResult]=await Promise.allSettled([bookingQuote(autocabRequest),...(discountedRequest?[bookingQuote(discountedRequest)]:[])]);
 if(normalResult.status==='rejected')throw normalResult.reason;
 let response=normalResult.value;
 let basePence=readFare(response,policy.pricePath,policy.priceUnit);
 let smartFare:{applied:boolean;reason:string;normalPence:number;candidatePence?:number;signal:SmartSignal}|undefined;
 if(signal&&decision){
  smartFare={applied:false,reason:decision.reason,normalPence:basePence,signal};
  if(discountedRules&&discountedRequest&&discountedResult){
   try{
    if(discountedResult.status==='rejected')throw discountedResult.reason;
    const discountedResponse=discountedResult.value,candidatePence=readFare(discountedResponse,policy.pricePath,policy.priceUnit);
    smartFare.candidatePence=candidatePence;
    // Use the entire matching request/response, including costs and capabilities.
    // A higher or unchanged capability quote never replaces the normal fare.
    if(candidatePence<basePence&&policy.smartFareMode==='live'){
     smartFare.applied=true;bookingRules=discountedRules;autocabRequest=discountedRequest;response=discountedResponse;basePence=candidatePence;
    }else smartFare.reason=candidatePence>=basePence?'no-lower-fare':'shadow';
   }catch{smartFare.reason='discount-unavailable'}
  }
 }
 const snapshot=input.service==='priority'&&policy.priorityUpliftMode==='percentage'&&policy.dynamicPricingEnabled?await demandSnapshot(policy):{waiting:null,clear:null};
 const standardAdjustment=fareAdjustment(policy,input.service,snapshot.waiting,snapshot.clear);
 const member=await activeMembership(customerId,policy),memberPercent=membershipAddonPercent(policy,member?.tierId||null,input.service);
 const standardFare=fareBreakdown(basePence,standardAdjustment.percent,standardAdjustment.fixedPence);
 const memberFare=memberPercent===null?standardFare:fareBreakdown(basePence,memberPercent,0);
 const membership=member&&memberFare.totalPence<standardFare.totalPence?{...member,standardTotalPence:standardFare.totalPence,savingPence:standardFare.totalPence-memberFare.totalPence}:undefined;
 const {percent,fixedPence,demand}=membership?{percent:memberPercent!,fixedPence:0,demand:`membership-${membership.tierId}`} : standardAdjustment;
 validateSchedule(input.service,input.scheduledAt,policy.minPrebookMinutes);

 const expiry=Math.min(Date.now()+policy.quoteValiditySeconds*1000,input.scheduledAt?Date.parse(input.scheduledAt)-policy.minPrebookMinutes*60000:Infinity);
 const quote:FareQuote={id:randomUUID(),liveBooking:bookingRules.liveBookingsEnabled,bookingRules,paymentMethod:bookingRules.paymentMethod,autocabRequest,autocabCosts:readAutocabCosts(response),vehicle:input.vehicle,service:input.service,scheduledAt:input.scheduledAt,pickup:input.pickup.text,destination:input.destination.text,vias:input.vias.map(v=>v.text),...fareBreakdown(basePence,percent,fixedPence),fixedPence,percent,demand,currency:'GBP',expiresAt:new Date(expiry).toISOString()};
 return {...quote,...(smartFare?{smartFare}:{}),...(membership?{membership}:{})};
}
export async function createQuote(input:z.infer<typeof quoteRequestSchema>,customerId:string|null=null){
 const quote=await calculateQuote(input,customerId);
 return {quote:publicFareQuote(quote),token:signQuote(quote)};
}
