'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState,useSyncExternalStore,type ReactNode} from 'react';
import {Activity,BookOpen,CarFront,ChevronDown,ChevronRight,CreditCard,Database,LayoutDashboard,LogOut,Menu,Settings2,ShieldCheck,X} from 'lucide-react';
import './admin-workspace.css';

type MenuItem={label:string;href:string};
type MenuGroup={id:string;label:string;icon:typeof BookOpen;items:MenuItem[]};
const groups:MenuGroup[]=[
 {id:'fleet',label:'Drivers / Vehicles',icon:CarFront,items:[{label:'Drivers',href:'/admin/drivers'},{label:'Vehicles',href:'/admin/vehicles'}]},
 {id:'bookings',label:'Booking',icon:BookOpen,items:[{label:'Live overview',href:'/admin'},{label:'Search bookings',href:'/admin/bookings'},{label:'Booking rules',href:'/admin/configuration#bookings'}]},
 {id:'pricing',label:'Pricing & Payments',icon:CreditCard,items:[{label:'Fares & promotions',href:'/admin/configuration#pricing'},{label:'Payments',href:'/admin/configuration#payments'}]},
 {id:'systems',label:'Systems',icon:Database,items:[{label:'API connections',href:'/admin/configuration#api'},{label:'Webhooks',href:'/admin/configuration#webhooks'},{label:'TaxiCRM database',href:'/admin/configuration#taxicrm'},{label:'SMS gateway',href:'/admin/configuration#sms'},{label:'Maps & places',href:'/admin/configuration#maps'}]},
 {id:'settings',label:'Settings',icon:Settings2,items:[{label:'Settings overview',href:'/admin/configuration#overview'},{label:'General & security',href:'/admin/configuration#general'},{label:'Customer sign-in',href:'/admin/configuration#identity'},{label:'Dispatch rules',href:'/admin/configuration#dispatch'}]},
];
function subscribeHash(callback:()=>void){window.addEventListener('hashchange',callback);return()=>window.removeEventListener('hashchange',callback)}
export default function AdminWorkspace({children}:{children:ReactNode}){
 const pathname=usePathname(),hash=useSyncExternalStore(subscribeHash,()=>window.location.hash,()=>''),[mobileOpen,setMobileOpen]=useState(false),[expanded,setExpanded]=useState<Record<string,boolean>>({bookings:true,settings:true});
 const close=()=>setMobileOpen(false);
 return <div className="admin-workspace-shell"><button className="admin-workspace-mobile-toggle" type="button" onClick={()=>setMobileOpen(true)} aria-label="Open Admin menu" aria-expanded={mobileOpen}><Menu size={21}/><span>Menu</span></button>{mobileOpen&&<button className="admin-workspace-backdrop" type="button" aria-label="Close Admin menu" onClick={close}/>}
 <aside className={`admin-workspace-sidebar${mobileOpen?' is-open':''}`} aria-label="Admin menu"><div className="admin-workspace-brand"><Link href="/admin" onClick={close}><span className="admin-workspace-mark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b><small>ADMIN WORKSPACE</small></span></Link><button type="button" className="admin-workspace-close" aria-label="Close menu" onClick={close}><X size={19}/></button></div><nav aria-label="Admin sections"><Link className={`admin-workspace-home${pathname==='/admin'?' active':''}`} href="/admin" onClick={close} aria-current={pathname==='/admin'?'page':undefined}><LayoutDashboard size={20}/><span>Dashboard</span></Link>{groups.map(group=>{const Icon=group.icon,open=expanded[group.id]??false,groupActive=group.items.some(item=>item.href===pathname+hash||(pathname==='/admin/configuration'&&!hash&&item.href==='/admin/configuration#general'));return <div className="admin-workspace-group" key={group.id}><button className={groupActive?'active':''} type="button" aria-expanded={open} onClick={()=>setExpanded(current=>({...current,[group.id]:!open}))}><Icon size={21}/><span>{group.label}</span>{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>{open&&<div className="admin-workspace-submenu">{group.items.map(item=><Link key={item.href} href={item.href} onClick={close} aria-current={item.href===pathname+hash||(pathname==='/admin/configuration'&&!hash&&item.href==='/admin/configuration#general')?'page':undefined}>{item.label}</Link>)}</div>}</div>})}<Link className="admin-workspace-dispatch" href="/dispatch" prefetch={false} onClick={close}><Activity size={20}/><span>Open Dispatch</span><ChevronRight size={16}/></Link></nav><div className="admin-workspace-sidebar-footer"><span><ShieldCheck size={15}/> Secured Admin access</span><Link href="/api/admin/logout" prefetch={false}><LogOut size={17}/>Sign out</Link></div></aside><div className="admin-workspace-content">{children}</div></div>;
}
