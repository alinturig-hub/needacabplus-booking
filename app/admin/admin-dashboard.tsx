'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowRight,CalendarDays,UsersRound,CarFront,MonitorSmartphone,TriangleAlert,UserRoundPlus,Settings2,CalendarPlus,Database,Radio,CreditCard,ChartNoAxesCombined,RefreshCw,LoaderCircle} from 'lucide-react';
import type {DashboardSummary,OutcomeCount} from '@/lib/admin-dashboard';
import {taxiCrmAppUrl} from '@/lib/admin-links';
import './admin-dashboard.css';
const count=(n:number|null|undefined)=>n===null||n===undefined?'—':n.toLocaleString('en-GB');
const time=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value));
function Card({icon,title,value,children,href,action,attention=false,className=''}:{icon:ReactNode;title:string;value:number|null|undefined;children:ReactNode;href:string;action:string;attention?:boolean;className?:string}){
 return <article className={`dashboard-card ${className}${attention?' dashboard-card-attention':''}`}>
  <span className="dashboard-card-icon" aria-hidden="true">{icon}</span>
  <div className="dashboard-card-content"><h2>{title}</h2><strong className="dashboard-card-value">{count(value)}</strong>
   <div className="dashboard-card-detail">{children}</div><Link href={href} className="dashboard-card-action">{action}<ArrowRight size={17}/></Link>
  </div>
 </article>;
}
function BookingOutcome({title,counts,kind}:{title:string;counts:OutcomeCount|null|undefined;kind:string}){
 return <section className={`dashboard-outcome dashboard-outcome-${kind}`} aria-label={title}>
  <h3>{title}</h3><strong className="dashboard-outcome-total">{count(counts?.total)}</strong>
  <dl>{(['cash','account','card'] as const).map(payment=><div key={payment}><dt>{payment[0].toUpperCase()+payment.slice(1)}</dt><dd>{count(counts?.[payment])}</dd></div>)}
   {Boolean(counts?.other)&&<div><dt>Other / unknown</dt><dd>{count(counts?.other)}</dd></div>}
  </dl>
 </section>;
}
export default function AdminDashboard(){
 const [data,setData]=useState<DashboardSummary|null>(null),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(false);
 const pending=useRef(false),abort=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  if(pending.current)return;
  pending.current=true;
  const controller=new AbortController();abort.current=controller;
  try{
   const response=await fetch('/api/admin/dashboard',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error('Unable to refresh dashboard information.');
   setData(await response.json() as DashboardSummary);setError('');
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to refresh dashboard information.')}
  finally{if(abort.current===controller){pending.current=false;if(!controller.signal.aborted)setRefreshing(false)}}
 },[]);
 useEffect(()=>{
  const initial=setTimeout(()=>void load(),0);const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},30_000);
  return()=>{clearTimeout(initial);clearInterval(timer);abort.current?.abort();pending.current=false};
 },[load]);
 const attention=data&&data.attention.documents!==null&&data.attention.setup!==null?data.attention.documents+data.attention.setup:null;
 const partial=Boolean(data&&(data.bookings===null||data.fleet===null||data.memberships===null||attention===null));
 const crm=taxiCrmAppUrl();
 const paymentLabel=data?({live:'Live mode',test:'Test mode',disabled:'Not enabled',incomplete:'Setup required',unavailable:'Unavailable'} as const)[data.connections.payments]:'Checking…';
 return <main className="admin-dashboard" aria-busy={!data&&!error}>
  <header className="dashboard-heading"><div><span className="dashboard-eyebrow">ADMIN WORKSPACE</span><h1>Dashboard</h1><p>Your workspace at a glance.</p></div>
   <div className="dashboard-heading-status"><span className={`dashboard-health ${error||partial?'is-warning':''}`}><i/>{error?'Refresh unavailable':partial?'Some information unavailable':data?'Workspace updated':'Loading workspace…'}</span>
    <button type="button" className="dashboard-refresh" aria-label="Refresh dashboard" disabled={refreshing} onClick={()=>{setRefreshing(true);void load()}}>{refreshing?<LoaderCircle className="dashboard-spin" size={17}/>:<RefreshCw size={17}/>}</button>
    {data&&<small>Updated {time(data.checkedAt)} UK{error?' · Last successful refresh':''}</small>}
   </div>
  </header>
  {error&&<p className="dashboard-notice" role="alert">{error} {data?'Previously loaded figures are shown below.':'Please try refreshing.'}</p>}
  <section className="dashboard-cards" aria-label="Workspace summary">
   <Card className="dashboard-bookings-card" icon={<CalendarDays/>} title="Bookings today" value={data?.bookings} href="/admin/live-overview" action="View live overview">
    <p>{data?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(data.day+'T12:00:00Z')):'Today'} · 00:00:00–23:59:59 UK · pickup time</p>
    {data?.bookings===null&&<p className="dashboard-unavailable">Booking data unavailable</p>}
    <div className="dashboard-outcomes"><BookingOutcome title="Completed" counts={data?.outcomes?.completed} kind="completed"/><BookingOutcome title="Cancelled" counts={data?.outcomes?.cancelled} kind="cancelled"/><BookingOutcome title="No Fare" counts={data?.outcomes?.noFare} kind="no-fare"/></div>
   </Card>
   <Card icon={<UsersRound/>} title="Drivers online" value={data?.fleet?.online} href="/admin/drivers" action="View drivers"><div className="dashboard-driver-chips"><span><i/>{count(data?.fleet?.free)} free</span><span><i/>{count(data?.fleet?.busy)} busy</span></div><small>Autocab live feed</small></Card>

   <Card icon={<MonitorSmartphone/>} title="Need A Cab Plus bookings" value={data?.webapp} href="/admin/bookings" action="View bookings"><p>Need A Cab Plus · pickups today</p></Card>
   <Card icon={<UsersRound/>} title="Memberships" value={data?.memberships?.active} href="/admin/configuration#pricing-rules" action="Membership settings"><p>Members with active benefits</p><div className="dashboard-member-tiers">{data?.memberships?.tiers?.map(tier=><div key={tier.id}><span>{tier.name}</span><strong>{count(tier.active)}</strong></div>)}</div>{Boolean(data?.memberships?.test)&&<small>Includes {count(data?.memberships?.test)} operator test access</small>}</Card>
   <Card icon={<TriangleAlert/>} title="Needs attention" value={attention} href="/admin/vehicles" action="Review fleet documents" attention={Boolean(attention)}><p>{data?.attention.documents===null?'Document checks unavailable':`${count(data?.attention.documents)} local fleet documents due or expired`}</p><Link className="dashboard-setup-link" href="/admin/drivers">Review driver documents →</Link>{Boolean(data?.attention.setup)&&<Link className="dashboard-setup-link" href="/admin/configuration#payments">Payment setup required →</Link>}</Card>
  </section>
  <section className="dashboard-quick"><h2>Quick actions</h2><div>
   <a href="https://dispatch.needacabplus.app/" target="_blank" rel="noopener noreferrer"><CalendarPlus/><span>Add booking</span></a>
   <Link href="/admin/drivers"><UserRoundPlus/><span>Manage drivers</span></Link>
   <Link href="/admin/vehicles"><CarFront/><span>Fleet settings</span></Link>
   <Link href="/admin/configuration#bookings"><Settings2/><span>Booking rules</span></Link>
  </div></section>
  <section className="dashboard-connections" aria-label="Connection status"><h2>Connections</h2>
   <Link href="/admin/configuration#webhooks"><Radio/><span>Autocab<small className={data?.connections.autocab==='live'?'is-good':'is-warning'}><i/>{!data?'Checking…':data.connections.autocab==='live'?'Receiving events':data.connections.autocab==='stale'?'Feed delayed':'Unavailable'}</small>{data?.connections.lastEvent&&<em>Last event {time(data.connections.lastEvent)} UK</em>}</span></Link>
   <Link href="/admin/configuration#taxicrm"><Database/><span>Database<small className={data?.connections.database?'is-good':'is-warning'}><i/>{!data?'Checking…':data.connections.database?'Connected':'Unavailable'}</small></span></Link>
   <Link href="/admin/configuration#payments"><CreditCard/><span>Payments<small className={data?.connections.payments==='live'?'is-good':'is-warning'}><i/>{paymentLabel}</small></span></Link>
  </section>
  <footer className="dashboard-crm"><ChartNoAxesCombined size={18}/><span>Looking for reports and business insights?</span>{crm&&<a href={crm} target="_blank" rel="noopener noreferrer">Open TaxiCRM<ArrowRight size={16}/></a>}</footer>
 </main>;
}
