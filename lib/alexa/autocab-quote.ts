import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {directAutocabBookingQuote} from '../autocab-api';
import {requireAutocabIntegration} from '../integration-control';
const address=z.object({text:z.string().trim().min(5).max(250),coordinate:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).passthrough(),zoneId:z.number().int().nonnegative()}).passthrough();
export const alexaJourneySchema=z.object({pickup:address,destination:address}).strict();
const constraints=z.object({forbiddenDrivers:z.array(z.number()).length(0),requestedDrivers:z.array(z.number()).length(0)});
const point=z.object({address,type:z.enum(['Pickup','Destination']),note:z.literal(''),passengerDetailsIndex:z.null()});
const requestSchema=z.object({companyId:z.number().int().positive(),customerId:z.number().int().positive().optional(),capabilities:z.array(z.number().int().positive()).max(30),passengers:z.literal('1'),pickup:point,destination:point,vias:z.array(z.unknown()).length(0),pickupDueTime:z.string().datetime(),pickupDueTimeUtc:z.string().datetime(),driverConstraints:constraints,vehicleConstraints:z.object({forbiddenVehicles:z.array(z.number()).length(0),requestedVehicles:z.array(z.number()).length(0)}),hold:z.literal(false)}).strict();
const quoteSchema=z.object({id:z.string().uuid(),pricingAuthority:z.literal('autocab'),settingsFingerprint:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string().datetime(),expiresAt:z.string().datetime(),pickup:z.string(),destination:z.string(),totalPence:z.number().int().positive().max(1000000),currency:z.literal('GBP'),request:requestSchema}).strict();
export type AlexaAutocabQuote=z.infer<typeof quoteSchema>;
export type AlexaAutocabRequest=z.infer<typeof requestSchema>;
export function autocabSettings(env:Record<string,string|undefined>=process.env){
 const positive=(s:string|undefined,fallback?:number)=>{if(!s?.trim())return fallback;if(!/^\d+$/.test(s.trim())||!Number.isSafeInteger(Number(s))||Number(s)<=0)throw Error('INVALID_ALEXA_AUTOCAB_SETTINGS');return Number(s)};
 const companyId=positive(env.ALEXA_AUTOCAB_COMPANY_ID,1)!,customerId=positive(env.ALEXA_AUTOCAB_CASH_CUSTOMER_ID);
 const capabilities=[...new Set((env.ALEXA_AUTOCAB_CAPABILITIES||'').trim()?(env.ALEXA_AUTOCAB_CAPABILITIES||'').split(',').map(s=>positive(s)!):[])].sort((a,b)=>a-b);
 if(capabilities.length>30||capabilities.some(v=>!v))throw Error('INVALID_ALEXA_AUTOCAB_SETTINGS');
 const settings={companyId,...(customerId?{customerId}:{}),capabilities};
 return {...settings,fingerprint:createHash('sha256').update(JSON.stringify(settings)).digest('hex')};
}
export function providerFare(payload:unknown){
 const parsed=z.object({currency:z.literal('GBP').optional(),outward:z.object({price:z.number().positive().max(10000),currency:z.literal('GBP').optional()})}).parse(payload),value=parsed.outward.price,pence=Math.round(value*100);
 if(!Number.isSafeInteger(pence)||Math.abs(value*100-pence)>0.000001)throw Error('INVALID_AUTOCAB_FARE');return pence;
}
export async function directAutocabQuote(input:z.infer<typeof alexaJourneySchema>,options:{now?:number;env?:Record<string,string|undefined>;fetchQuote?:typeof directAutocabBookingQuote;integrationCheck?:typeof requireAutocabIntegration}={}){
 await (options.integrationCheck||requireAutocabIntegration)();const journey=alexaJourneySchema.parse(input),settings=autocabSettings(options.env),now=options.now??Date.now(),due=new Date(now).toISOString();
 if(journey.pickup.text.toLowerCase()===journey.destination.text.toLowerCase())throw Error('DIFFERENT_STOPS_REQUIRED');
 const request:AlexaAutocabRequest={companyId:settings.companyId,...(settings.customerId?{customerId:settings.customerId}:{}),capabilities:settings.capabilities,passengers:'1',pickup:{address:journey.pickup,type:'Pickup',note:'',passengerDetailsIndex:null},destination:{address:journey.destination,type:'Destination',note:'',passengerDetailsIndex:null},vias:[],pickupDueTime:due,pickupDueTimeUtc:due,driverConstraints:{forbiddenDrivers:[],requestedDrivers:[]},vehicleConstraints:{forbiddenVehicles:[],requestedVehicles:[]},hold:false};
 const totalPence=providerFare(await (options.fetchQuote||directAutocabBookingQuote)(request));
 return quoteSchema.parse({id:randomUUID(),pricingAuthority:'autocab',settingsFingerprint:settings.fingerprint,createdAt:due,expiresAt:new Date(now+180000).toISOString(),pickup:journey.pickup.text,destination:journey.destination.text,totalPence,currency:'GBP',request});
}
function key(){const secret=process.env.ADMIN_SESSION_SECRET;if(!secret||secret.length<32)throw Error('ALEXA_QUOTE_KEY_MISSING');return createHash('sha256').update('alexa-autocab:v1:'+secret).digest();}
export function sealAutocabQuote(quote:AlexaAutocabQuote){const parsed=quoteSchema.parse(quote),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from('alexa-autocab:v1'));const body=Buffer.concat([cipher.update(JSON.stringify(parsed)),cipher.final()]);return ['aa1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');}
export function openAutocabQuote(token:string,now=Date.now()){
 try{const [prefix,iv,tag,body,...rest]=token.split('.');if(prefix!=='aa1'||rest.length||token.length>64000)throw Error();const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));cipher.setAAD(Buffer.from('alexa-autocab:v1'));cipher.setAuthTag(Buffer.from(tag,'base64url'));const quote=quoteSchema.parse(JSON.parse(Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString()));if(Date.parse(quote.expiresAt)<=now||Date.parse(quote.createdAt)>now+5000||quote.settingsFingerprint!==autocabSettings().fingerprint)throw Error();return quote;}catch{throw Error('ALEXA_AUTOCAB_QUOTE_CHANGED');}
}
export async function recheckAutocabFare(quote:AlexaAutocabQuote,options:Parameters<typeof directAutocabQuote>[1]={}){
 const current=await directAutocabQuote({pickup:quote.request.pickup.address,destination:quote.request.destination.address},options);
 if(current.settingsFingerprint!==quote.settingsFingerprint||current.totalPence!==quote.totalPence)throw Error('AUTOCAB_FARE_CHANGED');return current.request;
}
