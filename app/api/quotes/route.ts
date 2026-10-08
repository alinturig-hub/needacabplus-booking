import {z} from 'zod';
import {QuoteError} from '@/lib/quote-policy';
import {AutocabApiError,AutocabConfigurationError} from '@/lib/autocab-api';
import {sameOrigin} from '@/lib/security';
import {createQuote,loadQuotePolicy,quoteRequestSchema} from '@/lib/quotes';
import {loadBookingPolicy} from '@/lib/app-configuration';
import {enabledPaymentMethods} from '@/lib/booking-payments';
import {getCustomer} from '@/lib/customer-auth';
export const dynamic='force-dynamic';
export async function GET(){try{const p=await loadQuotePolicy(),rules=await loadBookingPolicy(),paymentMethods=enabledPaymentMethods(rules);return Response.json({paymentMethods,defaultPaymentMethod:paymentMethods.includes(rules.paymentMethod)?rules.paymentMethod:paymentMethods[0],liveBookingsEnabled:rules.liveBookingsEnabled,enabled:p.enabled&&paymentMethods.length>0,minPrebookMinutes:p.minPrebookMinutes,vehicles:['saloon']},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Quote settings are temporarily unavailable.'},{status:503})}}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 try{const input=quoteRequestSchema.parse(await request.json()),customer=await getCustomer();return Response.json(await createQuote(input,customer?.id||null),{headers:{'Cache-Control':'no-store'}})}catch(error){const message=error instanceof z.ZodError?'Select a complete Autocab address for every stop, including coordinates and zone.':error instanceof QuoteError||error instanceof AutocabApiError||error instanceof AutocabConfigurationError?error.message:'Unable to get an Autocab fare right now. Please try again.';return Response.json({error:message},{status:422,headers:{'Cache-Control':'no-store'}})}
}
