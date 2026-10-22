'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {CarTaxiFront,RefreshCw,Settings2} from 'lucide-react';
import {bookingPeriod} from '@/lib/booking-period';
import {hackneyBookingHref,type HackneyPeriodSelection} from '@/lib/hackney-period.mjs';
import './workspace.css';
type Data={policy:{prefixes:string[];flaggedSources:string[]};period:{period:string;start:string|null;end:string|null};summary:{hackney:number;private_hire:number;street:number;overlap:number;unknown_driver:number;hackney_today:number;cmac_jobs:number;cmac_completed:number;cmac_completed_value:string;cmac_missing_price:number;cmac_zero_price:number};checkedAt:string};
const count=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('en-GB');
const periods=[['today','Today'],['yesterday','Yesterday'],['7days','7 days'],['30days','30 days'],['custom','Custom'],['all','All history']];
const dayLabel=(value:string)=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC'});
export default function HackneyWorkspace(){
 const [loaded,setLoaded]=useState<{key:string;value:Data}|null>(null);
 const [selection,setSelection]=useState<HackneyPeriodSelection>({period:'today'});
 const [customOpen,setCustomOpen]=useState(false);
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[rangeError,setRangeError]=useState('');
 const [prefixes,setPrefixes]=useState(''),[sources,setSources]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const controller=useRef<AbortController|null>(null),version=useRef(0),policyInitialized=useRef(false);
 const key=JSON.stringify(selection),data=loaded?.key===key?loaded.value:null;
 const load=useCallback(async()=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const request=++version.current;
  setLoading(true);setError('');
  try{
   const params=new URLSearchParams({period:selection.period});if(selection.period==='custom'){params.set('from',selection.from||'');params.set('to',selection.to||'')}
   const response=await fetch('/api/admin/hackney?'+params,{cache:'no-store',signal:abort.signal});
   const next=await response.json() as Data&{error?:string};if(!response.ok)throw Error(next.error||'Unable to load Hackney data.');
   if(request!==version.current||abort.signal.aborted)return;
   setLoaded({key:JSON.stringify(selection),value:next});
   if(!policyInitialized.current){setPrefixes(next.policy.prefixes.join(', '));setSources(next.policy.flaggedSources.join(', '));policyInitialized.current=true}
  }catch(e){if(!abort.signal.aborted&&request===version.current)setError(e instanceof Error?e.message:'Unable to load Hackney data.')}
  finally{if(!abort.signal.aborted&&request===version.current)setLoading(false)}
 },[selection]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);controller.current?.abort()}},[load]);
 function selectPeriod(period:string){
  setRangeError('');
  if(period==='custom'){
   setCustomOpen(true);
   if(!from||!to){const today=bookingPeriod(new URLSearchParams()).start!;setFrom(today);setTo(today)}
  }else{setCustomOpen(false);setSelection({period})}
 }
 function applyRange(){
  try{bookingPeriod(new URLSearchParams({period:'custom',from,to}));setRangeError('');setSelection({period:'custom',from,to})}
  catch(e){setRangeError(e instanceof Error?e.message:'Enter a valid date range.')}
 }
 async function save(){
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/admin/hackney',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:prefixes.split(',').map(s=>s.trim()).filter(Boolean),flaggedSources:sources.split(',').map(s=>s.trim()).filter(Boolean)})});
   const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||'Unable to save');
   setLoaded(null);await load();setNotice('Configuration saved. Booking groups use these rules across saved history and new bookings.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to save configuration.')}
  finally{setSaving(false)}
 }
 const rangeLabel=data?(data.period.start&&data.period.end?`${dayLabel(data.period.start)}${data.period.end!==data.period.start?' – '+dayLabel(data.period.end):''} · UK pickup date`:'All saved history · UK pickup date'):loading?'Loading selected period…':'Selected period unavailable.';
 const bookingLink=(group:string)=>data?<Link href={hackneyBookingHref(group,selection)}>View bookings →</Link>:<span>Booking list available after loading.</span>;
 return <main className="hackney-workspace"><header><div><small>OPERATIONS</small><h1><CarTaxiFront/> Hackney</h1><p>Booking groups based on the driver call sign saved on each journey.</p></div><button type="button" disabled={loading||saving} onClick={()=>void load()}><RefreshCw size={17}/>{loading?'Loading…':'Refresh'}</button></header>
 <section className="hackney-period-bar" aria-label="Hackney date filters"><div role="group" aria-label="Booking period">{periods.map(([id,label])=><button type="button" key={id} disabled={saving} aria-pressed={id==='custom'?customOpen:!customOpen&&selection.period===id} onClick={()=>selectPeriod(id)}>{label}</button>)}</div>
 {customOpen&&<form onSubmit={event=>{event.preventDefault();applyRange()}}><label>From<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)} required/></label><label>To<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} required/></label><button type="submit" disabled={saving}>Apply range</button></form>}
 {rangeError&&<p role="alert" className="hackney-error">{rangeError}</p>}<p role="status">{rangeLabel}</p><small>7 and 30 days include today. Custom includes both dates. All cards and booking lists use the selected period.</small></section>
 {error&&<p role="alert" className="hackney-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <section className="hackney-cards" aria-label="Hackney overview" aria-busy={loading}>{[
 ['Hackney',data?.summary.hackney,'Bookings assigned to a Hackney call sign.','hackney'],
 ['Private hire',data?.summary.private_hire,'Bookings with a saved call sign outside the Hackney prefixes.','private-hire'],
 ['Unknown',data?.summary.unknown_driver,'Bookings without a saved driver call sign.','unknown'],
 ].map(([label,value,description,group])=><article key={String(group)}><h2>{label}</h2><strong>{count(value as number|undefined)}</strong><p>{description}</p>{bookingLink(String(group))}</article>)}</section>
 <section className="hackney-detail"><article><h2>Classification rules</h2><p>Historical bookings use the call sign saved on that booking. Hackney includes every booking with a Hackney call sign, including account jobs.</p><p>The three driver categories are separate. A missing call sign remains Unknown.</p><p>Classification does not change dispatch eligibility, fares, booking outcomes or driver punctuality.</p>{data&&<small>Updated {new Date(data.checkedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK</small>}</article></section>
 <section className="hackney-settings"><h2><Settings2 size={20}/> Configuration</h2><p>Changes apply to booking grouping across the full history and future bookings. Original records remain unchanged.</p><label>Hackney call sign prefixes<input value={prefixes} disabled={loading||saving} onChange={e=>setPrefixes(e.target.value)} placeholder="9, 4"/><small>Comma-separated numeric prefixes.</small></label><button type="button" disabled={!data||loading||saving} onClick={()=>void save()}>{saving?'Saving…':'Save configuration'}</button></section>
 </main>;
}
