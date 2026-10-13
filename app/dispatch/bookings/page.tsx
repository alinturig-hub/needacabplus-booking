import {redirect} from 'next/navigation';
import {isDispatchUser} from '@/lib/security';
import AdminApp from '../../admin/admin-app';

export const dynamic='force-dynamic';
export default async function DispatchBookingsPage(){
 if(!await isDispatchUser())redirect('/dispatch/login');
 return <AdminApp mode="search" workspace="dispatch"/>;
}
