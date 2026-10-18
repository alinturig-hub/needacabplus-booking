import type Stripe from 'stripe';
export const BOOKING_PAYMENT_DOMAIN='webapp.needacabplus.app';
export type WalletDomainStatus={registered:boolean;applePay:string;googlePay:string};
const checks=new Map<string,{until:number;result:Promise<WalletDomainStatus>}>();
// Domain registration is part of enabling the requested wallet integration; it never creates a payment.
// Only our canonical booking host is registered, never an untrusted request Host header.
export function prepareStripeWalletDomain(stripe:Stripe,configurationKey:string):Promise<WalletDomainStatus>{
 const cached=checks.get(configurationKey);if(cached&&cached.until>Date.now())return cached.result;
 const result=(async()=>{try{
  const domains=await stripe.paymentMethodDomains.list({domain_name:BOOKING_PAYMENT_DOMAIN,limit:10});
  let domain=domains.data.find(item=>item.domain_name===BOOKING_PAYMENT_DOMAIN);
  if(!domain)domain=await stripe.paymentMethodDomains.create({domain_name:BOOKING_PAYMENT_DOMAIN},{idempotencyKey:`booking-domain:${configurationKey}`});
  return {registered:domain.enabled,applePay:domain.apple_pay.status,googlePay:domain.google_pay.status};
 }catch{return {registered:false,applePay:'unavailable',googlePay:'unavailable'}}})();
 checks.set(configurationKey,{until:Date.now()+300000,result});return result;
}
