import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCustomer} from '@/lib/customer-auth';
import {database} from '@/lib/database';
export const dynamic='force-dynamic';
export default async function AlexaSettings(){
 const customer=await getCustomer();if(!customer)redirect('/customer-login?returnTo=/alexa');
 let count=0;if(process.env.ALEXA_SKILL_ENABLED==='true')count=Number((await database().query('SELECT count(*)::int AS count FROM alexa_grants WHERE customer_id=$1 AND revoked_at IS NULL AND refresh_expires_at>now()',[customer.id])).rows[0].count);
 return <main style={{maxWidth:520,padding:24,margin:'40px auto'}}><h1>Alexa settings</h1><p>{process.env.ALEXA_SKILL_ENABLED==='true'?'Enable the private Need A Cab Plus skill in the Alexa app and choose Link account.':'The private Alexa pilot is not enabled yet.'}</p><p>{count} active Alexa connection{count===1?'':'s'}.</p>{count>0&&<form action="/api/alexa/revoke" method="post"><button style={{padding:14}}>Disconnect all Alexa connections</button></form>}<p><Link href="/account">Back to account</Link></p></main>;
}
