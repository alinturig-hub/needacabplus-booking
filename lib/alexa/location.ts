import {z} from 'zod';
import {addressAtCoordinates} from '../autocab-api';
import {alexaJourneySchema,autocabSettings} from './autocab-quote';
import {searchGuestAddresses} from './guest-search';
export const GEO_SCOPE='alexa::devices:all:geolocation:read';
export const alexaLocationContextSchema=z.object({
 System:z.object({apiEndpoint:z.string().max(200).optional(),apiAccessToken:z.string().max(16000).optional(),device:z.object({deviceId:z.string().max(512).optional(),supportedInterfaces:z.record(z.unknown()).optional()}).optional(),user:z.object({permissions:z.object({scopes:z.record(z.object({status:z.string().optional()}).passthrough()).optional()}).optional()}).optional()}),
 Geolocation:z.unknown().optional()
});
export type AlexaLocationContext=z.infer<typeof alexaLocationContextSchema>;
export type SuggestedPickup={address?:z.infer<typeof alexaJourneySchema>['pickup'];source:'gps'|'device';city?:string;measuredAt?:number};
const geoSchema=z.object({timestamp:z.string(),coordinate:z.object({latitudeInDegrees:z.number().min(-90).max(90),longitudeInDegrees:z.number().min(-180).max(180),accuracyInMeters:z.number().nonnegative().max(100)}),locationServices:z.object({access:z.literal('ENABLED'),status:z.literal('RUNNING')}).optional()});
const configuredAddress=z.object({addressLine1:z.string().trim().min(3).max(250),addressLine2:z.string().trim().max(250).nullable().optional(),addressLine3:z.string().trim().max(250).nullable().optional(),city:z.string().trim().min(2).max(100),postalCode:z.string().trim().min(3).max(15),countryCode:z.literal('GB')});
const defaults={fetcher:fetch,address:searchGuestAddresses,reverse:addressAtCoordinates,now:Date.now};
export async function suggestAlexaPickup(context:AlexaLocationContext|undefined,services:Partial<typeof defaults>&{budgetMs?:number;cityOnly?:boolean}={}):Promise<SuggestedPickup|null>{
 if(!context)return null;const s={...defaults,...services};let timer:ReturnType<typeof setTimeout>|undefined;
 async function read():Promise<SuggestedPickup|null>{
  const system=context!.System,mobile=Boolean(context!.Geolocation)||Boolean(system.device?.supportedInterfaces?.Geolocation);
  if(mobile){
   if(system.user?.permissions?.scopes?.[GEO_SCOPE]?.status!=='GRANTED')return null;
   const parsed=geoSchema.safeParse(context!.Geolocation);if(!parsed.success)return null;
   const geo=parsed.data,age=s.now()-Date.parse(geo.timestamp);
   if(!Number.isFinite(age)||age< -10000||age>60000)return null;
   const {latitudeInDegrees:latitude,longitudeInDegrees:longitude}=geo.coordinate;
   const reversed=await s.reverse(latitude,longitude,autocabSettings().companyId,true,30);
   const address=alexaJourneySchema.shape.pickup.safeParse(reversed);if(!address.success)return null;
   return {address:{...address.data,coordinate:{...address.data.coordinate,latitude,longitude}},source:'gps',measuredAt:Date.parse(geo.timestamp),...(typeof address.data.town==='string'?{city:address.data.town}:{})};
  }
  if(!system.apiAccessToken||!system.apiEndpoint||!system.device?.deviceId)return null;
  const origin=new URL(system.apiEndpoint);
  if(!['https://api.amazonalexa.com','https://api.eu.amazonalexa.com','https://api.fe.amazonalexa.com'].includes(origin.origin)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)return null;
  const url=new URL('/v1/devices/'+encodeURIComponent(system.device.deviceId)+'/settings/address',origin);
  const response=await s.fetcher(url,{headers:{Authorization:'Bearer '+system.apiAccessToken},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(1500)});
  if(!response.ok)return null; // 403 is normal when device-address permission is not granted.
  const parsed=configuredAddress.safeParse(await response.json());if(!parsed.success)return null;
  const address=parsed.data;if(services.cityOnly)return {source:'device',city:address.city};
  const text=[address.addressLine1,address.addressLine2,address.addressLine3,address.city,address.postalCode].filter(Boolean).join(', ');
  const matches=await s.address(text,{city:address.city});
  // A registered address must resolve uniquely; never substitute the first neighbour.
  return matches.length===1?{address:matches[0],source:'device',city:address.city}:null;
 }
 try{return await Promise.race([read(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),Math.min(5500,Math.max(1,services.budgetMs??5500)));})]);}catch{return null;}finally{clearTimeout(timer);}
}
export function parseTaxiJourney(raw:string):{pickup?:string;destination?:string}|null{
 const value=raw.trim();if(value.length>330)return null;
 const pair=/^from\s+(.+?)\s+to\s+(.+)$/i.exec(value);
 const valid=(s:string)=>s.trim().length>=3&&s.trim().length<=160&&!/\s+to\s+/i.test(s);
 if(pair&&valid(pair[1])&&valid(pair[2]))return {...(/^(?:here|my (?:current )?location)$/i.test(pair[1].trim())?{}:{pickup:pair[1].trim()}),destination:pair[2].trim()};
 const to=/^to\s+(.+)$/i.exec(value);if(to&&valid(to[1]))return {destination:to[1].trim()};
 const from=/^from\s+(.+)$/i.exec(value);if(from&&valid(from[1]))return /^(?:here|my (?:current )?location)$/i.test(from[1].trim())?{}:{pickup:from[1].trim()};
 return null;
}
