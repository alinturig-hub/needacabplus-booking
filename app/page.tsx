import {headers} from 'next/headers';
import BookingApp from './booking-app';
import {redirect} from 'next/navigation';
import {getCustomer} from '@/lib/customer-auth';
import {getGuestSession} from '@/lib/customer-guest';
export const dynamic='force-dynamic';
export default async function Home(){const h=await headers();if(h.get('host')?.split(':')[0]==='admin.needacabplus.app')redirect('/admin');const customer=await getCustomer();if(!customer&&!await getGuestSession())redirect('/customer-login?returnTo=/');return <BookingApp customer={customer}/>}
