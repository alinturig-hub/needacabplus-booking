'use client';
import Link from 'next/link';
import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import {Clock3,CreditCard,ChevronRight,Users,Zap} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {vehicles,money} from '@/lib/vehicles';
import type {PublicFareQuote} from '@/lib/quote-presentation';
export type QuoteSelection={quote:PublicFareQuote;token:string};
type Config={enabled:boolean;minPrebookMinutes:number;vehicles:string[];paymentMethods:('cash'|'card')[];defaultPaymentMethod?:'cash'|'card';liveBookingsEnabled:boolean};
const keyOf=(service:string,vehicle:string)=>`${service}:${vehicle}`;
const localDate=(iso:string)=>{const date=new Date(iso);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)};
export default function QuoteChooser({pickup,destination,vias,initial,customer,paymentLabel,onChoose}:{pickup:Record<string,unknown>|null;destination:Record<string,unknown>|null;vias:(Record<string,unknown>|null)[];initial:QuoteSelection|null;customer:boolean;paymentLabel:string;onChoose:(value:QuoteSelection)=>void}){
 const [selected,setSelected]=useState(initial?keyOf(initial.quote.service,initial.quote.vehicle):'priority:saloon'),[scheduled,setScheduled]=useState(initial?.quote.scheduledAt?localDate(initial.quote.scheduledAt):''),[config,setConfig]=useState<Config|null>(null),[offers,setOffers]=useState<Record<string,QuoteSelection>>(initial?{[keyOf(initial.quote.service,initial.quote.vehicle)]:initial}:{}),[errors,setErrors]=useState<Record<string,string>>({}),[loading,setLoading]=useState<Record<string,boolean>>({}),[configError,setConfigError]=useState(''),[revision,setRevision]=useState(0),[now,setNow]=useState(Date.now);
 const [paymentMethod,setPaymentMethod]=useState<'cash'|'card'>(initial?.quote.paymentMethod||'cash');
 const cached=useRef(offers);
 const routeKey=JSON.stringify({pickup,destination,vias});
 const guaranteed=selected.startsWith('guarantee:');
 const scheduledAt=scheduled&&Number.isFinite(new Date(scheduled).getTime())?new Date(scheduled).toISOString():null;
 const dateValid=Boolean(scheduledAt&&Date.parse(scheduledAt)>=now+(config?.minPrebookMinutes??30)*60000);
 useEffect(()=>{const controller=new AbortController();fetch('/api/quotes',{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json() as Config&{error?:string};if(!r.ok)throw new Error(data.error);setConfig(data);setPaymentMethod(current=>data.paymentMethods.includes(current)?current:data.defaultPaymentMethod||'cash')}).catch(e=>{if(!controller.signal.aborted)setConfigError(e.message)});return()=>controller.abort()},[revision]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  if(!config?.enabled||!config.paymentMethods.includes(paymentMethod))return;let active=true;const controller=new AbortController();
  const timer=setTimeout(async()=>{
   const route=JSON.parse(routeKey);const allowed=config.vehicles;
   const jobs=allowed.flatMap(vehicle=>[{vehicle,service:'priority' as const,scheduledAt:null as string|null},...(scheduledAt&&Date.parse(scheduledAt)>=Date.now()+config.minPrebookMinutes*60000?[{vehicle,service:'guarantee' as const,scheduledAt}]:[])]);
   await Promise.all(jobs.map(async job=>{
    const key=keyOf(job.service,job.vehicle),old=cached.current[key];
    if(old&&Boolean(old.quote.liveBooking)===config.liveBookingsEnabled&&old.quote.paymentMethod===paymentMethod&&old.quote.scheduledAt===job.scheduledAt&&Date.parse(old.quote.expiresAt)>Date.now())return;
    if(!active)return;setLoading(all=>({...all,[key]:true}));setErrors(all=>({...all,[key]:''}));
    try{const r=await fetch('/api/quotes',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({...route,...job,paymentMethod})}),data=await r.json() as QuoteSelection&{error?:string};if(!r.ok)throw new Error(data.error||'Fare unavailable. Please try again.');if(active){cached.current={...cached.current,[key]:data};setOffers(cached.current)}}
    catch(e){if(active&&!controller.signal.aborted)setErrors(all=>({...all,[key]:e instanceof Error?e.message:'Fare unavailable.'}))}
    finally{if(active)setLoading(all=>({...all,[key]:false}))}
   }));clearTimeout(timeout);
  },350);const timeout=setTimeout(()=>{if(active){controller.abort();setLoading({});setConfigError('Some fares took too long. Please retry.')}},25000);
  return()=>{active=false;clearTimeout(timer);clearTimeout(timeout);controller.abort()};
 },[config,routeKey,scheduledAt,revision,paymentMethod]);
 const current=offers[selected],valid=Boolean(config?.enabled&&config.paymentMethods.includes(paymentMethod)&&current&&Boolean(current.quote.liveBooking)===config.liveBookingsEnabled&&current.quote.paymentMethod===paymentMethod&&!(config.liveBookingsEnabled&&paymentMethod==='card')&&Date.parse(current.quote.expiresAt)>now&&(!guaranteed||(dateValid&&current.quote.scheduledAt===scheduledAt))&&!loading[selected]);
 function retry(){setConfigError('');cached.current={};setOffers({});setRevision(v=>v+1)}
 const available=vehicles.filter(v=>config?.vehicles.includes(v.id));
 return <div className="ride-picker">
  <div className="ride-time"><Clock3 size={17}/><span>{guaranteed?'Schedule your pick-up':'Ride now'}</span>{guaranteed&&<small>At least {config?.minPrebookMinutes??30} min ahead</small>}</div>
  {guaranteed&&<label className="ride-schedule">Pick-up date & time<Input type="datetime-local" value={scheduled} onChange={e=>{setScheduled(e.target.value);setConfigError('')}}/><small>Your device’s local time</small></label>}
  {configError&&<p className="error-message" role="alert">{configError}</p>}{config&&!config.enabled&&<p role="status">Rides are temporarily unavailable.</p>}
  {!config&&!configError&&<p role="status">Finding your rides…</p>}
  <div className="ride-options" role="group" aria-label="Choose a ride">{(['priority','guarantee'] as const).flatMap(service=>available.map(v=>{
   const key=keyOf(service,v.id),offer=offers[key],ready=offer&&offer.quote.paymentMethod===paymentMethod&&Date.parse(offer.quote.expiresAt)>now&&(service==='priority'||(dateValid&&offer.quote.scheduledAt===scheduledAt));
   const title=`${service==='priority'?'Priority':'Guarantee'} ${v.id==='saloon'?'taxi':v.id==='estate'?'Estate':'XL'}`;
   return <button type="button" key={key} className={`ride-option ${selected===key?'is-selected':''}`} aria-pressed={selected===key} onClick={()=>setSelected(key)}>
    <span className="ride-car-art" aria-hidden="true"><Image src="/car-marker-live.png" width={35} height={63} unoptimized alt=""/></span><span className="ride-option-copy"><strong>{title} <span><Users size={13}/>{v.passengers}</span></strong><small>{service==='priority'?'As soon as possible':scheduledAt?new Date(scheduledAt).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Reserve for later'}</small>{service==='priority'&&<span className="ride-option-badge"><Zap size={12}/>Priority</span>}</span>
    <span className="ride-option-price">{loading[key]?'…':ready?money(offer.quote.totalPence):service==='guarantee'&&!dateValid?'Set time':errors[key]?'Unavailable':'—'}</span>
   </button>
  }))}</div>
  {errors[selected]&&<p className="error-message" role="alert">{errors[selected]}</p>}
  {guaranteed&&scheduled&&!dateValid&&<p role="alert" className="small-note">Choose a pick-up at least {config?.minPrebookMinutes??30} minutes from now.</p>}
  <div className="ride-payment-methods" role="group" aria-label="Payment method">{config?.paymentMethods.map(method=><button type="button" key={method} aria-pressed={paymentMethod===method} onClick={()=>setPaymentMethod(method)}>{method==='cash'?'Cash to driver':'Card'}</button>)}</div>{config?.liveBookingsEnabled&&paymentMethod==='card'&&<p role="status" className="small-note">Live card bookings are not available yet. Choose cash to book.</p>}
  <div className="ride-checkout">{paymentMethod==='cash'?<div className="ride-payment">Cash to driver</div>:<Link className="ride-payment" href={customer?'/account':'/customer-login?returnTo=/'}><CreditCard size={22}/><span>{offers[selected]?.quote.paymentMethod==='cash'?'Cash to driver':paymentLabel}</span><ChevronRight size={19}/></Link>}
   {configError||errors[selected]||(current&&!valid&&!loading[selected]&&(!guaranteed||dateValid))?<Button type="button" className="primary-action" onClick={retry}>Refresh fares</Button>:<Button type="button" className="primary-action" disabled={!valid} onClick={()=>{if(current&&Date.parse(current.quote.expiresAt)>Date.now())onChoose(current)}}>{loading[selected]?'Finding your fare…':guaranteed&&!dateValid?'Choose pick-up time':`Choose ${guaranteed?'Guarantee':'Priority'}`}</Button>}
   <span className="ride-test-label">{config?.liveBookingsEnabled?'Cash paid to driver':'Booking preview · no charge'}</span>
  </div>
 </div>
}
