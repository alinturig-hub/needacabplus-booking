import {createHash} from 'node:crypto';
import {getCustomer} from '@/lib/customer-auth';
import {database} from '@/lib/database';
import {stripeConfiguration} from '@/lib/stripe';

export async function customerStripeProfile(){
 const customer=await getCustomer();if(!customer)throw new Error('AUTHENTICATION_REQUIRED');
 const {stripe,settings}=await stripeConfiguration(),mode=settings.mode||'test';
 const configurationKey=createHash('sha256').update(`${mode}:${settings.publishableKey}`).digest('hex');
 const db=database(),existing=await db.query<{stripe_customer_id:string}>('SELECT stripe_customer_id FROM customer_stripe_profiles WHERE customer_id=$1 AND configuration_key=$2',[customer.id,configurationKey]);
 let stripeCustomerId=existing.rows[0]?.stripe_customer_id;
 if(!stripeCustomerId){
  // Preserve an existing live wallet; never reuse its customer in a sandbox.
  if(mode==='live'&&customer.stripeCustomerId){const prior=await stripe.customers.retrieve(customer.stripeCustomerId);if(!prior.deleted)stripeCustomerId=prior.id}
  if(!stripeCustomerId){const created=await stripe.customers.create({email:customer.email,name:customer.fullName,phone:customer.phone,metadata:{needACabCustomerId:customer.id}},{idempotencyKey:`wallet:${customer.id}:${configurationKey}`});stripeCustomerId=created.id}
  await db.query('INSERT INTO customer_stripe_profiles (customer_id,configuration_key,stripe_customer_id,mode) VALUES ($1,$2,$3,$4) ON CONFLICT (customer_id,configuration_key) DO NOTHING',[customer.id,configurationKey,stripeCustomerId,mode]);
 }

 return{customer,stripe,settings,stripeCustomerId,configurationKey};
}

