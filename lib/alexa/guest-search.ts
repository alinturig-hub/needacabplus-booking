import {alexaJourneySchema,autocabSettings} from './autocab-quote';
import {searchAddresses,resolveAddressPlaceId} from '../autocab-api';
import {rankAddressSuggestions} from '../address-ranking';
import {stationSearchQuery} from '../station-search';
import {z} from 'zod';
type Address=z.infer<typeof alexaJourneySchema>['pickup'];
const suggestion=z.object({address:z.string().min(1).max(250),fullAddress:z.record(z.unknown()).nullable().optional(),placeID:z.string().max(600).nullable().optional()});
async function namedLookup(query:string){
 const origin=new URL(process.env.MAP_ADDRESS_LOOKUP_ORIGIN||'https://webapp.needacab.uk');
 if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('INVALID_LOOKUP_ORIGIN');
 const url=new URL('/api/address/lookup',origin);url.searchParams.set('text',query);
 const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(2500)});
 if(!response.ok)throw Error('LOOKUP_UNAVAILABLE');
 return z.array(suggestion).max(100).parse(await response.json());
}
const defaults={lookup:namedLookup,search:searchAddresses,resolve:resolveAddressPlaceId};
// Read-only lookup budget stays below Alexa's response deadline. Never use this
// timeout helper around booking creation: an interrupted send has an unknown outcome.
async function bounded<T>(read:()=>Promise<T>,ms:number):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),Math.max(1,ms));})]);}finally{clearTimeout(timer);}}
export async function searchGuestAddresses(spoken:string,services:Partial<typeof defaults>&{city?:string}={}):Promise<Address[]>{
 const query=spoken.trim();if(query.length<3||query.length>160||/^(?:my )?(home|work|house|office)$/i.test(query))return [];
 const s={...defaults,...services},city=services.city?.trim().slice(0,100)||'Plymouth',deadline=Date.now()+5500;let items:z.infer<typeof suggestion>[]=[];
 const lookupQuery=/^(?:the\s+)?(?:(?:trains?|railway|rail)\s+)?station$/i.test(query)?city+' train station':/^(?:the\s+)?(?:bus station|airport|city cent(?:re|er))$/i.test(query)?city+' '+query:stationSearchQuery(query)||query;
 try{items=await bounded(()=>s.lookup(lookupQuery),2500);}catch{/* Fall back to the operator's configured address provider. */}
 if(!items.length){
  try{const raw=await bounded(()=>s.search(lookupQuery,autocabSettings().companyId,...(city.toLowerCase()==='plymouth'?[50.3755,-4.1427] as const:[undefined,undefined] as const)),Math.min(2500,deadline-Date.now()));items=raw.flatMap(item=>{const parsed=suggestion.safeParse({address:item.address||item.text,fullAddress:item.fullAddress||item,placeID:item.placeID||item.placeId});return parsed.success?[parsed.data]:[];});}catch{return [];}
 }
 const ranked=rankAddressSuggestions(items,query,city),unique=ranked.filter((item,index)=>ranked.findIndex(other=>other.address.toLowerCase()===item.address.toLowerCase())===index).slice(0,3);
 const results=await Promise.allSettled(unique.map(async item=>{
  const direct=alexaJourneySchema.shape.pickup.safeParse(item.fullAddress);
  let address:Address;
  if(direct.success)address=direct.data;
  else if(item.placeID){address=alexaJourneySchema.shape.pickup.parse(await bounded(()=>s.resolve(item.placeID!),Math.min(2000,deadline-Date.now())));}
  else return null;
  // Preserve the venue name from Places alongside its resolved street/coordinates.
  return {...address,text:item.address};
 }));
 return results.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]);
}
