import {randomUUID} from 'node:crypto';
import {signQuote} from './quote-token';
export {verifyQuote} from './quote-token';
import {z} from 'zod';
import {database} from './database';
import {bookingQuote} from './autocab-api';
import {publicClearVehicles} from './live-drivers';
import {QuoteError,quotePolicySchema,priorityPercent,readFare,fareBreakdown,validateSchedule,type Service} from './quote-policy';

const address=z.object({text:z.string().trim().min(5).max(250),coordinate:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).passthrough(),zoneId:z.number().int().nonnegative()}).passthrough();
export const quoteRequestSchema=z.object({pickup:address,destination:address,vias:z.array(address).max(3),vehicle:z.enum(['saloon','estate','xl']),service:z.enum(['priority','guarantee']),scheduledAt:z.string().datetime().nullable()}).strict();
export type FareQuote={id:string;vehicle:string;service:Service;scheduledAt:string|null;pickup:string;destination:string;vias:string[];basePence:number;upliftPence:number;totalPence:number;percent:number;demand:string;expiresAt:string;currency:'GBP'};
export async function loadQuotePolicy(){const result=await database().query("SELECT settings->'liveQuotes' AS policy FROM operations_settings WHERE id='pricing'");return quotePolicySchema.parse(result.rows[0]?.policy||{})}
export async function demandSnapshot(policy:Awaited<ReturnType<typeof loadQuotePolicy>>){
 if(policy.demandMode==='manual')return {waiting:null,clear:null,mode:'manual'};
 const [cars,result,fresh]=await Promise.all([publicClearVehicles(),database().query("SELECT pickup_data,timeline_data FROM bookings WHERE source<>'WebApp' AND status IN ('Booked','Created','Modified','Running Late') AND COALESCE(driver_data->>'id',driver_data->>'driverId','')=''"),database().query('SELECT max(recorded_at) AS latest FROM driver_positions')]);
 if(!fresh.rows[0]?.latest||Date.now()-new Date(fresh.rows[0].latest).getTime()>120000)return {waiting:null,clear:null,mode:'manual-fallback'};
 const now=Date.now(),window=policy.demandWindowMinutes*60000;
 const waiting=result.rows.filter(row=>{const due=Date.parse(row.timeline_data?.scheduledAt||row.pickup_data?.dueTime||'');return Number.isFinite(due)&&due>=now-window&&due<=now+window}).length;
 return {waiting,clear:cars.length,mode:'automatic'};
}
export async function createQuote(input:z.infer<typeof quoteRequestSchema>){
 const policy=await loadQuotePolicy();if(!policy.enabled)throw new QuoteError('Live quotes are currently unavailable.');
 validateSchedule(input.service,input.scheduledAt,policy.minPrebookMinutes);
 const stops=[input.pickup,...input.vias,input.destination];if(new Set(stops.map(stop=>stop.text.toLowerCase())).size!==stops.length)throw new QuoteError('Choose a different address for each stop.');
 const capabilities=input.vehicle==='saloon'?[]:policy[input.vehicle==='estate'?'estateCapabilities':'xlCapabilities'];
 if(input.vehicle!=='saloon'&&!capabilities.length)throw new QuoteError('This vehicle category is not available for quoting yet. Choose Plus Saloon.');
 const due=input.scheduledAt||new Date().toISOString();
 const point=(value:unknown,type:string)=>({address:value,type,note:'',passengerDetailsIndex:null});
 const response=await bookingQuote({companyId:1,capabilities,passengers:input.vehicle==='xl'?'6':'4',pickup:point(input.pickup,'Pickup'),destination:point(input.destination,'Destination'),vias:input.vias.map(v=>point(v,'Via')),pickupDueTime:due,pickupDueTimeUtc:due,driverConstraints:{forbiddenDrivers:[],requestedDrivers:[]},vehicleConstraints:{forbiddenVehicles:[],requestedVehicles:[]},hold:false});
 const basePence=readFare(response,policy.pricePath,policy.priceUnit),snapshot=input.service==='priority'?await demandSnapshot(policy):{waiting:null,clear:null},demand=priorityPercent(policy,snapshot.waiting,snapshot.clear),percent=input.service==='priority'?demand.percent:policy.guaranteePercent;
 validateSchedule(input.service,input.scheduledAt,policy.minPrebookMinutes);
 const expiry=Math.min(Date.now()+policy.quoteValiditySeconds*1000,input.scheduledAt?Date.parse(input.scheduledAt)-policy.minPrebookMinutes*60000:Infinity);
 const quote:FareQuote={id:randomUUID(),vehicle:input.vehicle,service:input.service,scheduledAt:input.scheduledAt,pickup:input.pickup.text,destination:input.destination.text,vias:input.vias.map(v=>v.text),...fareBreakdown(basePence,percent),percent,demand:input.service==='priority'?demand.level:'prebook',currency:'GBP',expiresAt:new Date(expiry).toISOString()};
 return {quote,token:signQuote(quote)};
}
