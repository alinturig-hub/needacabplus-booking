import type {BookingPolicy} from './booking-policy';
export type PaymentMethod='cash'|'card';
export function enabledPaymentMethods(policy:BookingPolicy):PaymentMethod[]{return [...(policy.cashEnabled?['cash' as const]:[]),...(policy.cardEnabled?['card' as const]:[])]}
export function selectPaymentMethod(policy:BookingPolicy,requested?:PaymentMethod):PaymentMethod{
 const methods=enabledPaymentMethods(policy);
 if(!methods.length)throw new Error('Bookings are temporarily unavailable. No payment method is enabled.');
 const method=requested||(methods.includes(policy.paymentMethod)?policy.paymentMethod:methods[0]);
 if(!methods.includes(method))throw new Error('This payment method is no longer available. Choose another payment method.');
 return method;
}
export function validateBookingPayment(policy:BookingPolicy,method:PaymentMethod,live:boolean){
 selectPaymentMethod(policy,method);
 if(live!==policy.liveBookingsEnabled)throw new Error('Booking settings changed. Request a new quote.');
 if(live&&method==='card')throw new Error('Live card bookings are not available yet. Choose cash.');
}
