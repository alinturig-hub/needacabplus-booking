'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,ArrowUpRight,BadgePoundSterling,Braces,ChevronRight,CreditCard,KeyRound,LayoutGrid,LogOut,MessageSquare,Route,Search,Settings2,ShieldCheck,Webhook} from 'lucide-react';
import CustomerSettings from './customer-settings';
import ApiConnections from './api-connections';
import WebhookProviders from './webhook-providers';
import {DispatchSettings,StripeSettings} from './operations-settings';
import PricingWorkspace from './pricing-workspace';
import './configuration.css';

const sections=[
 {id:'api',group:'Integrations & keys',title:'Autocab API',description:'Connections, base URLs, authentication headers, keys and booking endpoints.',keywords:'api token bearer basic company endpoint url header connection drivers vehicles',icon:Braces},
 {id:'webhooks',group:'Integrations & keys',title:'Webhooks',description:'Incoming booking events, provider endpoints and signing credentials.',keywords:'webhook inbound events dispatch accepted rejected modified',icon:Webhook},
 {id:'sms',group:'Integrations & keys',title:'SMS gateway',description:'Orion connection, signed URL, message templates and test messages.',keywords:'sms orion phone message test otp url header token',icon:MessageSquare},
 {id:'identity',group:'Integrations & keys',title:'Customer sign-in',description:'Google and Apple credentials, callback URLs and SMS verification.',keywords:'google apple oauth client id secret otp login registration verification authentication',icon:KeyRound},
 {id:'payments',group:'Integrations & keys',title:'Payments & Stripe',description:'Test or live mode, payment keys and webhook signing secret.',keywords:'stripe card wallet payment key secret sandbox',icon:CreditCard},
 {id:'bookings',group:'Booking operations',title:'Bookings',description:'Need A Cab Plus origin marker, account IDs, payments, capabilities and pickup timing.',keywords:'booking source origin marker reference ourReference account customerId priority guarantee prebook cash card capability minutes',icon:Settings2},
 {id:'pricing',group:'Booking operations',title:'Fares & demand',description:'Live quotes, Priority and prebook additions, and automatic demand pricing.',keywords:'pricing fare quote surcharge demand percent tariff',icon:BadgePoundSterling},
 {id:'dispatch',group:'Booking operations',title:'Dispatch rules',description:'Driver search, arrival buffers and the dispatch simulator.',keywords:'dispatch driver time simulation radius arrival',icon:Route},
] as const;
type SectionId='overview'|typeof sections[number]['id'];
function validSection(value:string):SectionId{return sections.some(item=>item.id===value)?value as SectionId:value==='integrations'?'api':'overview'}
export default function ConfigurationApp(){
 const [selected,setSelected]=useState<SectionId>('overview'),[visited,setVisited]=useState<SectionId[]>([]),[search,setSearch]=useState('');
 useEffect(()=>{const sync=()=>{const id=validSection(window.location.hash.slice(1));setSelected(id);setVisited(items=>items.includes(id)?items:[...items,id])};sync();window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
 function open(id:SectionId){setSelected(id);setVisited(items=>items.includes(id)?items:[...items,id]);window.history.replaceState(null,'','#'+id);window.scrollTo({top:0,behavior:'smooth'})}
 const current=sections.find(item=>item.id===selected),query=search.trim().toLowerCase(),filtered=sections.filter(item=>(item.title+' '+item.description+' '+item.keywords).toLowerCase().includes(query));
 return <main className="admin-shell configuration-hub"><header className="brandbar"><Link className="brand" href="/"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link><nav className="admin-nav" aria-label="Admin navigation"><Link href="/admin">Bookings</Link><Link href="/admin/dispatch">Dispatch Live</Link><Link href="/admin/drivers">Drivers</Link><Link href="/admin/vehicles">Vehicles</Link><Link href="/admin/live-map">Clear Map</Link><Link className="active" href="/admin/configuration">Configuration</Link></nav><Link className="admin-link" href="/api/admin/logout"><LogOut size={16}/>Sign out</Link></header>
 <div className="configuration-workspace"><header className="configuration-title"><div><span className="eyebrow">WORKSPACE SETTINGS</span><h1>Configuration</h1><p>Connections, credentials and booking rules. All in one place.</p></div><Link href="/admin" className="configuration-back"><ArrowLeft size={16}/>Back to bookings</Link></header>
 <div className="configuration-layout"><aside className="configuration-sidebar"><label className="configuration-search"><Search size={17}/><input type="search" aria-label="Search settings" placeholder="Find a setting…" value={search} onChange={e=>setSearch(e.target.value)}/></label><nav aria-label="Configuration sections"><button type="button" aria-current={selected==='overview'?'page':undefined} onClick={()=>open('overview')}><LayoutGrid size={18}/><span>Overview</span></button>{['Integrations & keys','Booking operations'].map(group=><div className="configuration-nav-group" key={group}><h2>{group}</h2>{filtered.filter(item=>item.group===group).map(item=><button key={item.id} type="button" aria-current={selected===item.id?'page':undefined} onClick={()=>open(item.id)}><item.icon size={18}/><span>{item.title}</span><ChevronRight size={14}/></button>)}</div>)}{!filtered.length&&<p className="configuration-no-results">No settings found. Try “SMS”, “keys” or “booking”.</p>}</nav><div className="configuration-security"><ShieldCheck size={18}/><p>Saved secrets stay encrypted. Replace a key only when you need to update it.</p></div></aside>
 <div className="configuration-content"><div hidden={selected!=='overview'}><div className="configuration-intro"><span className="configuration-kicker">YOUR CONTROL CENTRE</span><h2>What would you like to configure?</h2><p>Choose a service to manage its connection and keys, or update the rules used by your booking app.</p></div>{['Integrations & keys','Booking operations'].map(group=><section className="configuration-card-group" key={group}><h3>{group}</h3><div className="configuration-cards">{filtered.filter(item=>item.group===group).map(item=><button type="button" key={item.id} onClick={()=>open(item.id)}><div className="configuration-card-top"><span><item.icon size={22}/></span><ArrowUpRight size={18}/></div><strong>{item.title}</strong><p>{item.description}</p><span className="configuration-card-link">Open settings <ChevronRight size={14}/></span></button>)}</div></section>)}{!filtered.length&&<p className="configuration-no-results">No matching settings. Clear your search to see all sections.</p>}</div>
 {current&&<header className="configuration-section-heading"><button type="button" onClick={()=>open('overview')}>Configuration</button><ChevronRight size={14}/><span>{current.title}</span><p>{current.description}</p></header>}
 {/* Retain visited panels so navigating between sections does not discard unsaved edits. */}
 {visited.includes('api')&&<div hidden={selected!=='api'} className="configuration-panel"><ApiConnections/></div>}
 {visited.includes('webhooks')&&<div hidden={selected!=='webhooks'} className="configuration-panel"><WebhookProviders/></div>}
 {visited.includes('sms')&&<div hidden={selected!=='sms'}><CustomerSettings section="sms"/></div>}
 {visited.includes('identity')&&<div hidden={selected!=='identity'}><CustomerSettings section="identity"/></div>}
 {visited.includes('payments')&&<div hidden={selected!=='payments'}><StripeSettings/></div>}
 {visited.includes('bookings')&&<div hidden={selected!=='bookings'}><CustomerSettings section="bookings"/></div>}
 {visited.includes('pricing')&&<div hidden={selected!=='pricing'}><PricingWorkspace/></div>}
 {visited.includes('dispatch')&&<div hidden={selected!=='dispatch'}><DispatchSettings/></div>}
 </div></div></div></main>
}
