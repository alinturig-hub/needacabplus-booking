'use client';
import {useEffect,useMemo,useState} from 'react';
import {Elements,ExpressCheckoutElement,useElements,useStripe} from '@stripe/react-stripe-js';
import {loadStripe} from '@stripe/stripe-js';
import {Button} from '@/components/ui/button';
import {money} from '@/lib/vehicles';
import {passengerPaymentLabel,type PassengerPayment,type PassengerWallet} from '@/lib/passenger-payment';
import type {QuoteSelection} from './quote-chooser';
export default function BookingOnlinePayment(props:{selection:QuoteSelection;payment:PassengerPayment;disabled:boolean;onPaid:(id:string)=>Promise<void>}){
 const [wallet,setWallet]=useState<PassengerWallet|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetch('/api/customer/wallet',{cache:'no-store'}).then(async r=>{const data=await r.json() as PassengerWallet;if(!r.ok||!data.enabled)throw new Error(data.error||'Online payments are unavailable.');if(active)setWallet(data)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
 const key=wallet?.publishableKey;
 const stripePromise=useMemo(()=>key?loadStripe(key):null,[key]);
 if(error)return <p className="error-message" role="alert">{error}</p>;
 if(!wallet||!stripePromise)return <p role="status">Loading secure checkout…</p>;
 if(wallet.mode!=='test'||props.selection.quote.liveBooking)return <p role="status">Online booking payments are being configured. Choose cash to book now.</p>;
 return <Elements stripe={stripePromise} options={{mode:'payment',amount:props.selection.quote.totalPence,currency:'gbp',paymentMethodTypes:['card'],appearance:{theme:'stripe',variables:{colorPrimary:'#96712f'}}}}><Checkout {...props}/></Elements>;
}
function Checkout({selection,payment,disabled,onPaid}:{selection:QuoteSelection;payment:PassengerPayment;disabled:boolean;onPaid:(id:string)=>Promise<void>}){
 const stripe=useStripe(),elements=useElements(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[walletAvailable,setWalletAvailable]=useState<boolean|null>(null),[confirmedId,setConfirmedId]=useState('');
 const wallet=payment.kind==='apple_pay'||payment.kind==='google_pay';
 async function pay(){
  if(disabled||busy||!stripe||!elements||payment.kind==='cash')throw new Error('Complete the booking details before paying.');
  if(confirmedId){await onPaid(confirmedId);return}
  if(Date.parse(selection.quote.expiresAt)<=Date.now())throw new Error('Your fare expired. Request a new quote.');
  setBusy(true);setError('');
  try{
   if(wallet){const submitted=await elements.submit();if(submitted.error)throw new Error(submitted.error.message||'Unable to open wallet.');}
   const response=await fetch('/api/customer/booking-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quoteToken:selection.token,...(payment.kind==='saved_card'?{paymentMethodId:payment.id}:{})})}),data=await response.json() as {clientSecret?:string;error?:string};
   if(!response.ok||!data.clientSecret)throw new Error(data.error||'Unable to prepare payment.');
   const result=payment.kind==='saved_card'?await stripe.confirmCardPayment(data.clientSecret,{payment_method:payment.id}):await stripe.confirmPayment({elements,clientSecret:data.clientSecret,confirmParams:{return_url:window.location.origin+'/'},redirect:'if_required'});
   if(result.error)throw new Error(result.error.message||'Payment was not completed.');
   if(result.paymentIntent?.status!=='succeeded')throw new Error('Payment is still pending. Please check before trying again.');
   setConfirmedId(result.paymentIntent.id);await onPaid(result.paymentIntent.id);
  }finally{setBusy(false)}
 }
 async function submit(){try{await pay()}catch(e){setError(e instanceof Error?e.message:'Payment was not completed.')}}
 return <div className="booking-secure-checkout"><p className="payment-sandbox-note">Stripe sandbox · test payment only · no real money</p>{wallet?<><p>{passengerPaymentLabel(payment)} · {money(selection.quote.totalPence)}</p><fieldset disabled={disabled||busy} className={`express-payment-wrapper ${disabled||busy?'is-disabled':''}`} aria-label="Wallet checkout"><ExpressCheckoutElement options={{paymentMethods:{applePay:payment.kind==='apple_pay'?'auto':'never',googlePay:payment.kind==='google_pay'?'auto':'never',link:'never',paypal:'never',amazonPay:'never',klarna:'never'},buttonHeight:52,buttonType:{applePay:'book',googlePay:'book'}}} onReady={event=>setWalletAvailable(Boolean(event.availablePaymentMethods?.applePay||event.availablePaymentMethods?.googlePay))} onConfirm={async event=>{try{await pay()}catch(e){event.paymentFailed({reason:'fail',message:e instanceof Error?e.message:'Payment failed.'});setError(e instanceof Error?e.message:'Payment failed.')}}}/></fieldset>{walletAvailable===false&&<p role="status">This wallet is unavailable here. Return to ride choices and select a saved card or cash.</p>}</>:<Button type="button" className="primary-action" disabled={disabled||busy||!stripe} onClick={()=>void submit()}>{busy?'Confirming…':confirmedId?'Retry booking confirmation':`Confirm test payment · ${money(selection.quote.totalPence)}`}</Button>}{error&&<p role="alert" className="error-message">{error}</p>}</div>;
}
