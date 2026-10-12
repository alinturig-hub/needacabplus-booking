import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminApp from '../../admin/admin-app';

export const dynamic='force-dynamic';
export default async function DispatchBookingsPage(){
 if(!await isAdmin())redirect('/dispatch/login');
 return <AdminApp mode="search" workspace="dispatch"/>;
}
