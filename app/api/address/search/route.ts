import {z} from 'zod';
import {AutocabApiError,AutocabConfigurationError,searchAddresses} from '@/lib/autocab-api';
import {unavailable} from '@/lib/security';
import {readMapConfiguration} from '@/lib/map-settings';
import {searchMapTiler} from '@/lib/maptiler-geocoding';

export const dynamic='force-dynamic';
const querySchema=z.string().trim().min(2).max(160);
const suggestionSchema=z.object({address:z.string().trim().min(1),fullAddress:z.record(z.unknown()).nullable().optional(),placeID:z.string().nullable().optional(),customAddressID:z.union([z.string(),z.number()]).nullable().optional()});

export async function GET(request:Request){
 try{
  const query=querySchema.parse(new URL(request.url).searchParams.get('q')||'');
  const {settings,apiKey}=await readMapConfiguration();let suggestions:z.infer<typeof suggestionSchema>[];
  if(settings.searchProvider==='maptiler'&&apiKey){
   const features=await searchMapTiler(query,apiKey,{country:settings.country,language:settings.language,longitude:settings.proximityLongitude,latitude:settings.proximityLatitude});
   suggestions=features.map(feature=>({address:feature.label,fullAddress:{coordinate:{latitude:feature.latitude,longitude:feature.longitude}},placeID:null,customAddressID:null}));
  }else{
   const lookupOrigin=(process.env.MAP_ADDRESS_LOOKUP_ORIGIN||'https://webapp.needacab.uk').replace(/\/$/,'');
   const searchResponse=await fetch(`${lookupOrigin}/api/address/lookup?text=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'},cache:'no-store'});
   if(!searchResponse.ok)return Response.json({error:'Map address search is temporarily unavailable.'},{status:502});
   suggestions=z.array(suggestionSchema).parse(await searchResponse.json()).slice(0,8);
  }
  const resolved=await Promise.allSettled(suggestions.map(async suggestion=>{
   if(suggestion.placeID)return {address:suggestion.address,fullAddress:null,placeID:suggestion.placeID,customAddressID:suggestion.customAddressID||null};
   let address:Record<string,unknown>|undefined;
   if(suggestion.fullAddress){const coordinate=suggestion.fullAddress.coordinate as {latitude?:unknown;longitude?:unknown}|undefined,latitude=Number(coordinate?.latitude),longitude=Number(coordinate?.longitude);if(Number.isFinite(latitude)&&Number.isFinite(longitude))address=(await searchAddresses(suggestion.address,1,latitude,longitude))[0]}
   return address?{address:String(address.text||suggestion.address),fullAddress:address,placeID:suggestion.placeID||null,customAddressID:address.id||suggestion.customAddressID||null}:null;
  }));
  const items=resolved.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]);
  return Response.json({items},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({items:[]});if(error instanceof AutocabConfigurationError)return Response.json({error:error.message},{status:503});if(error instanceof AutocabApiError)return Response.json({error:error.message},{status:502});return unavailable(error)}
}
