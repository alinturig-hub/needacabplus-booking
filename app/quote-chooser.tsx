'use client';
import Link from 'next/link';
import Image from 'next/image';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Banknote,BriefcaseBusiness,CalendarClock,Clock3,CreditCard,ChevronDown,ChevronRight,LockKeyhole,Users,Zap} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {isPrebookInterval} from '@/lib/prebook-time';
import PickupTimePanel from './pickup-time-panel';
import RidePaymentPanel from './ride-payment-panel';
import {passengerPaymentLabel,type PassengerPayment} from '@/lib/passenger-payment';
import {vehicles,money} from '@/lib/vehicles';
import type {JourneyTiming} from '@/lib/journey-timing';
import type {PublicFareQuote} from '@/lib/quote-presentation';
export type QuoteSelection={quote:PublicFareQuote;token:string};
type Config={enabled:boolean;minPrebookMinutes:number;vehicles:string[];paymentMethods:('cash'|'card')[];defaultPaymentMethod?:'cash'|'card';liveBookingsEnabled:boolean;paidMember:boolean;serviceAccess:{asap:boolean;prebook:boolean;priority:boolean;guarantee:boolean;quietAsap:boolean}};
const keyOf=(service:string,vehicle:string)=>`${service}:${vehicle}`;
const serviceName={asap:'Ride now',priority:'Priority',prebook:'Pre-book',guarantee:'Guarantee'} as const;
const serviceDescription={asap:'A straightforward ride when you need it',priority:'Priority pickup for eligible customers',prebook:'Plan your pick-up in advance',guarantee:'Extra certainty for your scheduled trip'} as const;
export default function QuoteChooser({pickup,destination,vias,initial,initialService='asap',customer,onChoose,onScheduleChange,timing,initialPayment,onPaymentChange,onSignIn}:{pickup:Record<string,unknown>|null;destination:Record<string,unknown>|null;vias:(Record<string,unknown>|null)[];initial:QuoteSelection|null;initialService?:'asap'|'priority'|'prebook'|'guarantee';customer:boolean;initialPayment:PassengerPayment;onPaymentChange:(value:PassengerPayment)=>void;onSignIn:()=>void;onChoose:(value:QuoteSelection)=>void;onScheduleChange?:(value:string|null)=>void;timing?:JourneyTiming}){
 const [selected,setSelected]=useState(initial?keyOf(initial.quote.service,initial.quote.vehicle):`${initialService}:saloon`),[scheduled,setScheduled]=useState(initial?.quote.scheduledAt||''),[config,setConfig]=useState<Config|null>(null),[offers,setOffers]=useState<Record<string,QuoteSelection>>(initial?{[keyOf(initial.quote.service,initial.quote.vehicle)]:initial}:{}),[errors,setErrors]=useState<Record<string,string>>({}),[loading,setLoading]=useState<Record<string,boolean>>({}),[configError,setConfigError]=useState(''),[revision,setRevision]=useState(0),[now,setNow]=useState(Date.now);
 const [payment,setPayment]=useState<PassengerPayment>(initialPayment),[overlay,setOverlay]=useState<'payment'|'schedule'|null>(null),[notice,setNotice]=useState('');
 const paymentMethod=payment.kind==='cash'?'cash':'card';
 const cached=useRef(offers);
 const routeKey=JSON.stringify({pickup,destination,vias});
 const scheduledService=selected.startsWith('prebook:')||selected.startsWith('guarantee:');
 const displayedServices=useMemo(():('asap'|'priority'|'prebook'|'guarantee')[]=>scheduledService?['prebook','guarantee']:['asap','priority'],[scheduledService]);
 const scheduledAt=scheduled&&Number.isFinite(new Date(scheduled).getTime())?new Date(scheduled).toISOString():null;
 const dateValid=Boolean(scheduledAt&&Date.parse(scheduledAt)>=now+(config?.minPrebookMinutes??30)*60000&&isPrebookInterval(Date.parse(scheduledAt)));
 useEffect(()=>{const controller=new AbortController();fetch('/api/quotes',{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json() as Config&{error?:string};if(!r.ok)throw new Error(data.error);setConfig(data)}).catch(e=>{if(!controller.signal.aborted)setConfigError(e.message)});return()=>controller.abort()},[revision]);
 useEffect(()=>{if(config&&!config.serviceAccess.guarantee&&selected.startsWith('guarantee:'))setSelected(`prebook:${selected.split(':')[1]}`);if(config&&!config.serviceAccess.priority&&selected.startsWith('priority:'))setSelected(`asap:${selected.split(':')[1]}`)},[config,selected]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  if(!config?.enabled||!config.paymentMethods.includes(paymentMethod))return;let active=true;const controller=new AbortController();
  const timer=setTimeout(async()=>{
   const route=JSON.parse(routeKey);const allowed=config.vehicles;
   const jobs=allowed.flatMap(vehicle=>displayedServices.flatMap(service=>{
    const scheduledService=service==='prebook'||service==='guarantee';
    if(!config.serviceAccess[service])return [];
    if(scheduledService&&(!scheduledAt||Date.parse(scheduledAt)<Date.now()+config.minPrebookMinutes*60000||!isPrebookInterval(Date.parse(scheduledAt))))return [];
    return [{vehicle,service,scheduledAt:scheduledService?scheduledAt:null}];
   }));
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
 },[config,routeKey,scheduledAt,revision,paymentMethod,displayedServices]);
 const current=offers[selected],valid=Boolean(config?.enabled&&config.paymentMethods.includes(paymentMethod)&&current&&Boolean(current.quote.liveBooking)===config.liveBookingsEnabled&&current.quote.paymentMethod===paymentMethod&&!(config.liveBookingsEnabled&&paymentMethod==='card')&&Date.parse(current.quote.expiresAt)>now&&(!scheduledService||(dateValid&&current.quote.scheduledAt===scheduledAt))&&!loading[selected]);
 useEffect(()=>{onScheduleChange?.(scheduledService?scheduledAt:null)},[scheduledService,scheduledAt,onScheduleChange]);
 function retry(){setConfigError('');cached.current={};setOffers({});setRevision(v=>v+1)}
 function openSchedule(){setOverlay('schedule')}
 function choosePayment(value:PassengerPayment){setPayment(value);onPaymentChange(value);setNotice(`Payment method changed to ${passengerPaymentLabel(value)}`)}
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(timer)},[notice]);
 const available=vehicles.filter(v=>config?.vehicles.includes(v.id));
 return <div className="ride-picker">
  <div className="ride-picker-content"><div className="ride-time"><span className="ride-time-icon"><Clock3 size={18}/></span><span><strong>{scheduledService?'Scheduled pick-up':'Pick-up as soon as possible'}</strong><small>{scheduledService?`Book at least ${config?.minPrebookMinutes??30} minutes ahead`:'Choose the ride that suits your journey'}</small></span></div>
  {timing&&<div className="ride-journey-timing" aria-live="polite"><span><small>{scheduledService?'Pick-up':'Estimated pick-up'}</small><strong>{scheduledService?(scheduledAt?new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(scheduledAt)):'Set time'):timing.pickupMinutes!==null?`~${timing.pickupMinutes} min`:'Estimate unavailable'}</strong></span><ChevronRight size={17}/><span><small>Estimated drop-off</small><strong>{timing.arrivalTime||'—'}</strong></span><p>{scheduledService?'Estimated road travel time · UK time':timing.pickupMinutes!==null?'Based on nearby free cars · subject to assignment and traffic':'A pick-up estimate needs a recent free-car location'}</p></div>}
  {scheduledService&&<button type="button" className="ride-schedule-summary" onClick={openSchedule}><CalendarClock size={18}/><span>{scheduledAt?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(scheduledAt)):'Choose pick-up time'}</span><ChevronRight size={16}/></button>}
  {configError&&<p className="error-message" role="alert">{configError}</p>}{config&&!config.enabled&&<p role="status">Rides are temporarily unavailable.</p>}
  {!config&&!configError&&<p role="status">Finding your rides…</p>}
  {config&&!config.paidMember&&<p className="small-note" role="status">Standard ASAP and Pre-book are available. Priority, Guarantee and quiet-time ASAP discounts require an active paid membership. <Link href={customer?'/account#membership':'/customer-login?returnTo=/account%23membership'}>{customer?'View membership status':'Sign in'}</Link>.</p>}
  <div className="ride-service-list">{displayedServices.map(service=><section className="ride-service-group" key={service} aria-label={serviceName[service]}><div className="ride-service-heading"><div><span>{serviceName[service]}</span><small>{serviceDescription[service]}</small></div>{service==='priority'&&<Zap size={18} aria-hidden="true"/>}</div>{config&&!config.serviceAccess[service]?<div className="ride-service-locked"><LockKeyhole size={18}/><span>Paid membership required</span><Link href={customer?'/account#membership':'/customer-login?returnTo=/account%23membership'}>{customer?'View membership':'Sign in to view membership'}</Link></div>:<div className="ride-options" role="group" aria-label={`Choose a ${serviceName[service].toLowerCase()} vehicle`}>{available.map(v=>{
   const isScheduled=service==='prebook'||service==='guarantee',key=keyOf(service,v.id),offer=offers[key],ready=offer&&offer.quote.paymentMethod===paymentMethod&&Date.parse(offer.quote.expiresAt)>now&&(!isScheduled||(dateValid&&offer.quote.scheduledAt===scheduledAt));
   const title=service==='priority'?`${v.name} · Priority`:service==='guarantee'?`${v.name} · Guarantee`:v.name;
   return <button type="button" key={key} className={`ride-option ${selected===key?'is-selected':''}`} aria-pressed={selected===key} onClick={()=>{setSelected(key);if(isScheduled&&!dateValid)openSchedule()}}>
    <span className={`ride-car-art ride-car-${v.id}`} aria-hidden="true"><Image src="/car-marker-live.png" width={35} height={63} unoptimized alt=""/></span><span className="ride-option-copy"><strong>{title}</strong><small>{v.description}</small><span className="ride-option-features">{!isScheduled&&timing?.pickupMinutes!==null&&timing?.pickupMinutes!==undefined&&<span><Clock3 size={13}/>~{timing.pickupMinutes} min</span>}<span><Users size={13}/>{v.passengers}</span><span><BriefcaseBusiness size={13}/>{v.bags}</span>{service==='asap'&&ready&&offer.quote.smartFareApplied&&<span className="ride-option-badge">Smart Fare</span>}{ready&&offer.quote.membershipTier&&<span className="ride-option-badge member-fare">{offer.quote.membershipTier} fare</span>}</span></span>
    <span className="ride-option-price">{loading[key]?'…':ready?<>{offer.quote.standardTotalPence&&<del>{money(offer.quote.standardTotalPence)}</del>}<b>{money(offer.quote.totalPence)}</b></>:isScheduled&&!dateValid?'Set time':errors[key]?'Unavailable':'—'}</span>
   </button>
  })}</div>}</section>)}</div>
  {errors[selected]&&<p className="error-message" role="alert">{errors[selected]}</p>}
  {scheduledService&&scheduled&&!dateValid&&<p role="alert" className="small-note">Choose a pick-up at least {config?.minPrebookMinutes??30} minutes from now, in 5-minute intervals.</p>}
  </div><div className="ride-bottom-bar">
   <button type="button" className="ride-payment-selector" aria-label="Choose payment method" aria-haspopup="dialog" onClick={()=>setOverlay('payment')}>{payment.kind==='cash'?<Banknote size={24}/>:<CreditCard size={24}/>}<span><strong>{config&&!config.paymentMethods.includes(paymentMethod)?'Choose payment':passengerPaymentLabel(payment)} <ChevronDown size={16}/></strong><small>{payment.kind==='cash'?'Pay the driver':'Personal ride'}</small></span></button>
   {config?.liveBookingsEnabled&&paymentMethod==='card'&&<p role="status" className="small-note">Online booking payments are being configured. Choose cash to book now.</p>}
   <div className="ride-confirm-actions">{configError||errors[selected]||(current&&!valid&&!loading[selected]&&(!scheduledService||dateValid))?<Button type="button" className="primary-action" onClick={retry}>Refresh fares</Button>:<Button type="button" className="primary-action" disabled={!valid} onClick={()=>{if(current&&Date.parse(current.quote.expiresAt)>Date.now())onChoose(current)}}>{loading[selected]?'Finding your fare…':scheduledService&&!dateValid?'Choose pick-up time':'Confirm selection'}{valid&&current&&<span>{money(current.quote.totalPence)}</span>}</Button>}<button type="button" className="ride-calendar-button" aria-label="Schedule pick-up" aria-haspopup="dialog" onClick={openSchedule}><CalendarClock/></button></div>
   <span className="ride-test-label">{config?.liveBookingsEnabled?'Review your details before booking':'Booking preview · no driver requested'}</span>
  </div>
  {notice&&<div role="status" className="ride-payment-toast">{notice}</div>}
  {overlay==='schedule'&&<PickupTimePanel value={scheduledAt} minimum={config?.minPrebookMinutes??30} onClose={()=>setOverlay(null)} onApply={value=>{setScheduled(value||'');setSelected(`${value?(selected.startsWith('guarantee:')?'guarantee':'prebook'):'asap'}:${selected.split(':')[1]}`);setOverlay(null);setConfigError('')}}/>}
  {overlay==='payment'&&<RidePaymentPanel selected={payment} customer={customer} cashEnabled={Boolean(config?.paymentMethods.includes('cash'))} cardEnabled={Boolean(config?.paymentMethods.includes('card'))} live={Boolean(config?.liveBookingsEnabled)} onClose={()=>setOverlay(null)} onChoose={choosePayment} onSignIn={onSignIn}/>}
 </div>
}
