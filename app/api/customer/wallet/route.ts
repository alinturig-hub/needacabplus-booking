import {z} from 'zod';
import {getCustomer} from '@/lib/customer-auth';
import {database} from '@/lib/database';
import {sameOrigin,unavailable} from '@/lib/security';
import {stripeConfiguration} from '@/lib/stripe';

async function stripeCustomer(){
 const customer=await getCustomer();if(!customer)throw new Error('AUTHENTICATION_REQUIRED');
 const {stripe,settings}=await stripeConfiguration();let stripeCustomerId=customer.stripeCustomerId;
 if(!stripeCustomerId){const created=await stripe.customers.create({email:customer.email,name:customer.fullName,phone:customer.phone,metadata:{needACabCustomerId:customer.id}});stripeCustomerId=created.id;await database().query('UPDATE customer_accounts SET stripe_customer_id=$1,updated_at=now() WHERE id=$2',[stripeCustomerId,customer.id])}
 return{customer,stripe,settings,stripeCustomerId};
}

export async function GET(){try{const {stripe,settings,stripeCustomerId}=await stripeCustomer();const methods=await stripe.paymentMethods.list({customer:stripeCustomerId,type:'card'});return Response.json({enabled:true,publishableKey:settings.publishableKey||'',cards:methods.data.map(method=>({id:method.id,brand:method.card?.brand||'card',last4:method.card?.last4||'••••',expMonth:method.card?.exp_month||0,expYear:method.card?.exp_year||0}))},{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof Error&&error.message==='AUTHENTICATION_REQUIRED')return Response.json({error:'Authentication required.'},{status:401});if(error instanceof Error&&error.message.includes('not enabled'))return Response.json({enabled:false,cards:[],error:error.message},{status:503});return unavailable(error)}}

export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});try{const {customer,stripe,settings,stripeCustomerId}=await stripeCustomer();const intent=await stripe.setupIntents.create({customer:stripeCustomerId,usage:'off_session',payment_method_types:['card'],metadata:{needACabCustomerId:customer.id}});return Response.json({clientSecret:intent.client_secret,publishableKey:settings.publishableKey})}catch(error){if(error instanceof Error&&error.message==='AUTHENTICATION_REQUIRED')return Response.json({error:'Authentication required.'},{status:401});return unavailable(error)}}

export async function DELETE(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});try{const customer=await getCustomer();if(!customer?.stripeCustomerId)return Response.json({error:'Authentication required.'},{status:401});const body=z.object({paymentMethodId:z.string().startsWith('pm_')}).strict().parse(await request.json());const {stripe}=await stripeConfiguration();const method=await stripe.paymentMethods.retrieve(body.paymentMethodId);if(method.customer!==customer.stripeCustomerId)return Response.json({error:'Card not found.'},{status:404});await stripe.paymentMethods.detach(body.paymentMethodId);return Response.json({ok:true})}catch(error){if(error instanceof z.ZodError)return Response.json({error:'Invalid card.'},{status:400});return unavailable(error)}}
