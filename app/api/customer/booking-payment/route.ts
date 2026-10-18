import {z} from 'zod';
import {getCustomer} from '@/lib/customer-auth';
import {customerStripeProfile} from '@/lib/customer-stripe';
import {sameOrigin} from '@/lib/security';
import {activePaidMembership,loadQuotePolicy,verifyQuote} from '@/lib/quotes';
import {loadBookingPolicy} from '@/lib/app-configuration';
import {bookingServiceAccess} from '@/lib/booking-policy';
import {validateBookingPayment} from '@/lib/booking-payments';
import {validateSchedule} from '@/lib/quote-policy';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 const customer=await getCustomer();if(!customer)return Response.json({error:'Sign in before paying online.'},{status:401});
 try{
  const body=z.object({quoteToken:z.string().max(64000),paymentMethodId:z.string().regex(/^pm_[a-zA-Z0-9]+$/).optional()}).strict().parse(await request.json());
  const quote=verifyQuote(body.quoteToken),[rules,policy]=await Promise.all([loadBookingPolicy(),loadQuotePolicy()]);
  validateBookingPayment(rules,'card',Boolean(quote.liveBooking));
  if(!policy.enabled||quote.paymentMethod!=='card'||quote.liveBooking)throw new Error('Request a current sandbox card fare before paying.');
  const member=Boolean(await activePaidMembership(customer.id,policy)),access=bookingServiceAccess(rules,member);
  if(!access[quote.service]||(quote.smartFare?.applied&&!access.quietAsap)||quote.membership&&!member)throw new Error('Your membership benefits changed. Request a new fare.');
  validateSchedule(quote.service,quote.scheduledAt,policy.minPrebookMinutes);
  const {stripe,settings,stripeCustomerId}=await customerStripeProfile();
  if((settings.mode||'test')!=='test')throw new Error('Real online booking payments are not enabled. Choose cash or configure Stripe sandbox.');
  if(body.paymentMethodId){const method=await stripe.paymentMethods.retrieve(body.paymentMethodId);if(method.customer!==stripeCustomerId)throw new Error('Select a card saved to your account.');}
  if(!Number.isSafeInteger(quote.totalPence)||quote.totalPence<30)throw new Error('The fare cannot be paid by card. Request another fare.');
  const intent=await stripe.paymentIntents.create({amount:quote.totalPence,currency:'gbp',customer:stripeCustomerId,payment_method_types:['card'],capture_method:'automatic',metadata:{purpose:'booking_sandbox',quoteId:quote.id,customerId:customer.id}},{idempotencyKey:`booking-sandbox:${customer.id}:${quote.id}`});
  return Response.json({clientSecret:intent.client_secret,intentId:intent.id,publishableKey:settings.publishableKey,mode:'test'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof z.ZodError?'Invalid payment request.':error instanceof Error?error.message:'Unable to prepare payment.'},{status:409})}
}
