import {z} from 'zod';
import {isAdmin,sameOrigin} from '@/lib/security';
import {verifyQuote,loadQuotePolicy} from '@/lib/quotes';
import {validateSchedule} from '@/lib/quote-policy';
import {buildAutocabBookingRequest,passengerDetailsSchema} from '@/lib/autocab-booking-request';

export const dynamic='force-dynamic';
const schema=z.object({quoteToken:z.string().min(1).max(64000),passenger:passengerDetailsSchema}).strict();
// Inspect a prepared request without creating a booking, charging or dispatching.
export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success)return Response.json({error:input.error.issues[0]?.message||'Invalid booking details.'},{status:400});
 try{
  const quote=verifyQuote(input.data.quoteToken),policy=await loadQuotePolicy();
  if(!policy.enabled)throw new Error('Live quotes are currently unavailable.');
  validateSchedule(quote.service,quote.scheduledAt,policy.minPrebookMinutes);
  const body=buildAutocabBookingRequest(quote,input.data.passenger);
  return Response.json({previewOnly:true,sent:false,method:'POST',path:'/booking/v1/booking',headers:{'Content-Type':'application/json','third-party-user':'Need A Cab Plus'},body},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Unable to prepare booking.'},{status:422})}
}
