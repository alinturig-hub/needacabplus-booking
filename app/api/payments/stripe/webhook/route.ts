import {headers} from 'next/headers';
import {stripeConfiguration} from '@/lib/stripe';

export const dynamic='force-dynamic';
export async function POST(request:Request){try{const signature=(await headers()).get('stripe-signature');if(!signature)return Response.json({error:'Missing Stripe signature.'},{status:400});const payload=await request.text(),{stripe,webhookSecret}=await stripeConfiguration();if(!webhookSecret)return Response.json({error:'Stripe webhook secret is not configured.'},{status:503});stripe.webhooks.constructEvent(payload,signature,webhookSecret);return Response.json({received:true})}catch(error){console.error('Stripe webhook failure',error);return Response.json({error:'Invalid Stripe webhook.'},{status:400})}}
