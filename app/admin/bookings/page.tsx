import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminApp from '../admin-app';

export const dynamic='force-dynamic';

export default async function BookingSearchPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminApp mode="search"/>;
}
