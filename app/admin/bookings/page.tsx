import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminApp from '../admin-app';
import AdminWorkspace from '../admin-workspace';

export const dynamic='force-dynamic';

export default async function BookingSearchPage({searchParams}:{searchParams:Promise<{group?:string;period?:string}>}){
 const {group,period}=await searchParams;
 const initialGroup=['hackney','hackney-cmac','street','hackney-street','private-hire','unknown'].includes(group||'')?group!:'All';
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><AdminApp mode="search" initialGroup={initialGroup} initialPeriod={period==='all'?'all':'today'}/></AdminWorkspace>;
}
