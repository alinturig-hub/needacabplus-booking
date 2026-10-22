import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminApp from '../admin-app';
import AdminWorkspace from '../admin-workspace';

export const dynamic='force-dynamic';

export default async function BookingSearchPage({searchParams}:{searchParams:Promise<{group?:string;period?:string;from?:string;to?:string}>}){
 const {group,period,from,to}=await searchParams;
 const initialGroup=group==='hackney-cmac'||group==='hackney-street'?'hackney':['hackney','private-hire','unknown'].includes(group||'')?group!:'All';
 if(!await isAdmin())redirect('/admin-login');
 if(initialGroup!=='All'){
  const params=new URLSearchParams({group:initialGroup});
  if(period)params.set('period',period);if(from)params.set('from',from);if(to)params.set('to',to);
  redirect('/admin/hackney/bookings?'+params);
 }
 return <AdminWorkspace><AdminApp mode="search" initialPeriod={['today','yesterday','7days','30days','custom','all'].includes(period||'')?period!:'today'} initialFrom={from||''} initialTo={to||''}/></AdminWorkspace>;
}
