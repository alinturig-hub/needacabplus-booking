import {redirect} from 'next/navigation';
import {getCustomer} from '@/lib/customer-auth';
import CustomerAccount from './customer-account';
export const dynamic='force-dynamic';
export default async function AccountPage(){const customer=await getCustomer();if(!customer)redirect('/customer-login?returnTo=/account');return <CustomerAccount customer={customer}/>}
