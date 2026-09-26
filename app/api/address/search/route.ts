import {z} from 'zod';
import {AutocabApiError,AutocabConfigurationError,searchAddresses} from '@/lib/autocab-api';
import {unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const querySchema=z.string().trim().min(3).max(160);
const photonSchema=z.object({features:z.array(z.object({geometry:z.object({coordinates:z.tuple([z.number(),z.number()])}),properties:z.record(z.unknown())}))});

function value(properties:Record<string,unknown>,key:string){const item=properties[key];return typeof item==='string'?item.trim():''}
function label(properties:Record<string,unknown>){
 const street=[value(properties,'housenumber'),value(properties,'street')].filter(Boolean).join(' '),name=value(properties,'name'),place=value(properties,'city')||value(properties,'town')||value(properties,'village')||value(properties,'district'),postcode=value(properties,'postcode');
 return [...new Set([name,street,place,postcode].filter(Boolean))].join(', ');
}

export async function GET(request:Request){
 try{
  const query=querySchema.parse(new URL(request.url).searchParams.get('q')||'');
  const photonUrl=new URL('/api','https://photon.komoot.io');photonUrl.searchParams.set('q',`${query}, Plymouth, UK`);photonUrl.searchParams.set('lat','50.3755');photonUrl.searchParams.set('lon','-4.1427');photonUrl.searchParams.set('zoom','12');photonUrl.searchParams.set('lang','en');photonUrl.searchParams.set('limit','6');
  const geocodeResponse=await fetch(photonUrl,{headers:{Accept:'application/geo+json'},next:{revalidate:3600}});
  if(!geocodeResponse.ok)return Response.json({error:'Map address search is temporarily unavailable.'},{status:502});
  const geocoded=photonSchema.parse(await geocodeResponse.json());
  const resolved=await Promise.allSettled(geocoded.features.map(async feature=>{const [longitude,latitude]=feature.geometry.coordinates,text=label(feature.properties);if(!text)return null;const addresses=await searchAddresses(text,1,latitude,longitude),address=addresses[0];return address?{address:String(address.text||text),fullAddress:address,placeID:null,customAddressID:address.id||null}:null}));
  const items=resolved.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]);
  return Response.json({items},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return Response.json({items:[]});if(error instanceof AutocabConfigurationError)return Response.json({error:error.message},{status:503});if(error instanceof AutocabApiError)return Response.json({error:error.message},{status:502});return unavailable(error)}
}
