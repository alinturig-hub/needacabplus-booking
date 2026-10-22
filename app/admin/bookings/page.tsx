import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminApp from '../admin-app';
import AdminWorkspace from '../admin-workspace';

export const dynamic='force-dynamic';

export default async function BookingSearchPage({searchParams}:{searchParams:Promise<{group?:string}>}){
 const {group}=await searchParams;
 const initialGroup=['hackney','street','hackney-street','private-hire','unknown'].includes(group||'')?group!:'All';
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><AdminApp mode="search" initialGroup={initialGroup}/></AdminWorkspace>;
}
