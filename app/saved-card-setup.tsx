'use client';
import {useState,type FormEvent} from 'react';
import {PaymentElement,useElements,useStripe} from '@stripe/react-stripe-js';
import {ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
export default function CardSetup({onDone}:{onDone:(id?:string)=>Promise<void>}){
 const stripe=useStripe(),elements=useElements(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){event.preventDefault();if(!stripe||!elements||busy)return;setBusy(true);setError('');try{const result=await stripe.confirmSetup({elements,confirmParams:{return_url:`${window.location.origin}/account`},redirect:'if_required'});if(result.error)throw new Error(result.error.message||'Unable to save card.');if(result.setupIntent?.status!=='succeeded')throw new Error('Card setup is not complete.');const method=result.setupIntent.payment_method;await onDone(typeof method==='string'?method:method?.id)}catch(e){setError(e instanceof Error?e.message:'Unable to save card.')}finally{setBusy(false)}}
 return <form className="stripe-card-form" onSubmit={submit}><PaymentElement options={{layout:'tabs'}}/>{error&&<p className="error-message" role="alert">{error}</p>}<Button type="submit" className="primary-action" disabled={!stripe||busy}>{busy?'Saving card…':'Save card'}<ShieldCheck/></Button></form>;
}
