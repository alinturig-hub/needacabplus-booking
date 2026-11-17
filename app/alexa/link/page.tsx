import AlexaConsent from './consent';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCustomer} from '@/lib/customer-auth';
import {authorizationInput,alexaConfig} from '@/lib/alexa/policy';
export const dynamic='force-dynamic';
export default async function AlexaLink({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=new URLSearchParams();for(const [k,v] of Object.entries(await searchParams))if(typeof v==='string')params.set(k,v);
 let input;try{input=authorizationInput(params)}catch{return <main style={{maxWidth:520,padding:24,margin:'40px auto'}}><h1>Alexa account linking</h1><p>This linking request is unavailable or invalid. Start account linking from the private Alexa skill.</p><Link href="/">Return to Need A Cab Plus</Link></main>;}
 const customer=await getCustomer();if(!customer)redirect('/customer-login?returnTo='+encodeURIComponent('/alexa/link?'+params));
 return <AlexaConsent input={input} mode={alexaConfig().mode}/>;
}
