import {QuoteError} from '@/lib/quote-policy';
import {AutocabApiError,AutocabConfigurationError} from '@/lib/autocab-api';
import {z} from 'zod';
import {loadEbooker} from '@/lib/ebookers';
import {ebookerJourney,EbookerPolicyError} from '@/lib/ebooker-policy';
import {calculateQuote,quoteRequestSchema} from '@/lib/quotes';
import {signQuote} from '@/lib/quote-token';
import {publicFareQuote} from '@/lib/quote-presentation';
import {getCustomer} from '@/lib/customer-auth';
import {sameOrigin} from '@/lib/security';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 try{
  const config=await loadEbooker((await params).slug);if(!config)return Response.json({error:'This eBooker is unavailable.'},{status:404});
  const raw=await request.text();if(raw.length>64_000)return Response.json({error:'Journey details are too large.'},{status:413});
  const body=z.object({journey:quoteRequestSchema,passengers:z.number().int().min(1).max(4),revision:z.number().int().positive()}).strict().parse(JSON.parse(raw));
  if(body.journey.vehicle!=='saloon'||!['asap','prebook'].includes(body.journey.service)||body.journey.paymentMethod!=='cash')return Response.json({error:'Choose a standard cash journey.'},{status:400});
  const resolved=ebookerJourney(config,{pickup:body.journey.pickup,passengers:body.passengers,revision:body.revision});
  const quote=await calculateQuote({...body.journey,...resolved},(await getCustomer())?.id||null);
  quote.ebooker={id:config.id,slug:config.slug,name:config.name,revision:config.revision,passengers:body.passengers};
  return Response.json({quote:publicFareQuote(quote),token:signQuote(quote)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){const known=e instanceof EbookerPolicyError||e instanceof QuoteError||e instanceof AutocabApiError||e instanceof AutocabConfigurationError;return Response.json({error:e instanceof z.ZodError?'Select a resolved address for every stop.':known?e.message:'Unable to calculate the fare. Please try again.'},{status:known||e instanceof z.ZodError?422:503})}
}
