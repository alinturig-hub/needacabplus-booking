import {z} from 'zod';
export const passengerPaymentSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('cash')}).strict(),
 z.object({kind:z.literal('saved_card'),id:z.string().regex(/^pm_[a-zA-Z0-9]+$/),brand:z.string().max(30),last4:z.string().regex(/^\d{4}$/)}).strict(),
 z.object({kind:z.literal('apple_pay')}).strict(),
 z.object({kind:z.literal('google_pay')}).strict(),
]);
export type PassengerPayment=z.infer<typeof passengerPaymentSchema>;
export type SavedCard={id:string;brand:string;last4:string;expMonth:number;expYear:number};
export type PassengerWallet={enabled:boolean;mode?:'test'|'live';publishableKey?:string;cards:SavedCard[];walletDomain?:{registered:boolean;applePay:string;googlePay:string};error?:string};
export function passengerPaymentLabel(payment:PassengerPayment){return payment.kind==='cash'?'Cash':payment.kind==='apple_pay'?'Apple Pay':payment.kind==='google_pay'?'Google Pay':`${payment.brand.toUpperCase()} •••• ${payment.last4}`}
export function assertSandboxPayment(intent:{id:string;status:string;livemode:boolean;amount:number;currency:string;customer:string|{id:string}|null;metadata:Record<string,string>},expected:{quoteId:string;customerId:string;stripeCustomerId:string;amount:number}){
 if(intent.livemode||intent.status!=='succeeded'||intent.amount!==expected.amount||intent.currency!=='gbp'||(typeof intent.customer==='string'?intent.customer:intent.customer?.id)!==expected.stripeCustomerId||intent.metadata.quoteId!==expected.quoteId||intent.metadata.customerId!==expected.customerId||intent.metadata.purpose!=='booking_sandbox')throw new Error('The sandbox payment does not match this customer and fare.');
 return intent.id;
}

export function checkoutErrorMessage(error:unknown){
 if(error&&typeof error==='object'&&'type' in error&&typeof error.type==='string'&&error.type.startsWith('Stripe'))return 'Secure checkout is temporarily unavailable. Please try again or choose cash.';
 return error instanceof Error?error.message:'Unable to complete secure checkout.';
}
