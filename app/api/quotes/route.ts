import {z} from 'zod';
import {QuoteError} from '@/lib/quote-policy';
import {AutocabApiError,AutocabConfigurationError} from '@/lib/autocab-api';
import {sameOrigin} from '@/lib/security';
import {createQuote,loadQuotePolicy,quoteRequestSchema} from '@/lib/quotes';
export const dynamic='force-dynamic';
export async function GET(){try{const p=await loadQuotePolicy();return Response.json({enabled:p.enabled,minPrebookMinutes:p.minPrebookMinutes,vehicles:['saloon',...(p.estateCapabilities.length?['estate']:[]),...(p.xlCapabilities.length?['xl']:[])]},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Quote settings are temporarily unavailable.'},{status:503})}}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 try{const input=quoteRequestSchema.parse(await request.json());return Response.json(await createQuote(input),{headers:{'Cache-Control':'no-store'}})}catch(error){const message=error instanceof z.ZodError?'Select a complete Autocab address for every stop, including coordinates and zone.':error instanceof QuoteError||error instanceof AutocabApiError||error instanceof AutocabConfigurationError?error.message:'Unable to get an Autocab fare right now. Please try again.';return Response.json({error:message},{status:422,headers:{'Cache-Control':'no-store'}})}
}
