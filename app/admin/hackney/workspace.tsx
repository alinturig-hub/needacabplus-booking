'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {CarTaxiFront,RefreshCw,Settings2} from 'lucide-react';
import {bookingPeriod} from '@/lib/booking-period';
import {hackneyBookingHref,type HackneyPeriodSelection} from '@/lib/hackney-period.mjs';
import './workspace.css';
type Data={policy:{prefixes:string[];flaggedSources:string[]};period:{period:string;start:string|null;end:string|null};summary:{hackney:number;street:number;overlap:number;unknown_driver:number;hackney_today:number;cmac_jobs:number;cmac_completed:number;cmac_completed_value:string;cmac_missing_price:number;cmac_zero_price:number};checkedAt:string};
const money=(value:string|undefined)=>value===undefined?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(value));
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
 return <main className="hackney-workspace"><header><div><small>OPERATIONS</small><h1><CarTaxiFront/> Hackney</h1><p>Hackney activity and street bookings, with a clear distinction between driver category and booking origin.</p></div><button type="button" disabled={loading||saving} onClick={()=>void load()}><RefreshCw size={17}/>{loading?'Loading…':'Refresh'}</button></header>
 <section className="hackney-period-bar" aria-label="Hackney date filters"><div role="group" aria-label="Booking period">{periods.map(([id,label])=><button type="button" key={id} disabled={saving} aria-pressed={id==='custom'?customOpen:!customOpen&&selection.period===id} onClick={()=>selectPeriod(id)}>{label}</button>)}</div>
 {customOpen&&<form onSubmit={event=>{event.preventDefault();applyRange()}}><label>From<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)} required/></label><label>To<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} required/></label><button type="submit" disabled={saving}>Apply range</button></form>}
 {rangeError&&<p role="alert" className="hackney-error">{rangeError}</p>}<p role="status">{rangeLabel}</p><small>7 and 30 days include today. Custom includes both dates. All cards and booking lists use the selected period.</small></section>
 {error&&<p role="alert" className="hackney-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <section className="hackney-cards" aria-label="Hackney overview" aria-busy={loading}>{[
 ['Hackney bookings',data?.summary.hackney,'Bookings assigned to a Hackney call sign.','hackney'],
 ['Street / Flagdown',data?.summary.street,'Street pickup flag or a configured street booking source.','street'],
 ['Hackney + Street',data?.summary.overlap,'Street bookings assigned to a Hackney driver.','hackney-street'],
 ].map(([label,value,description,group])=><article key={String(group)}><h2>{label}</h2><strong>{count(value as number|undefined)}</strong><p>{description}</p>{bookingLink(String(group))}</article>)}</section>
 <section className="hackney-account-summary" aria-label="CMAC Hackney account bookings"><article><div><small>ACCOUNT BOOKINGS · SELECTED PERIOD</small><h2>CMAC · Hackney</h2><p>CMAC account jobs assigned to Hackney call signs. Included in the Hackney totals above.</p>{bookingLink('hackney-cmac')}</div><dl><div><dt>Bookings</dt><dd>{count(data?.summary.cmac_jobs)}</dd></div><div><dt>Completed</dt><dd>{count(data?.summary.cmac_completed)}</dd></div><div><dt>Completed booking value</dt><dd>{money(data?.summary.cmac_completed_value)}</dd></div></dl><p className="hackney-account-note">Sum of recorded prices for completed jobs in the selected period. Driver earnings and operator revenue are separate measures.</p>{Boolean(data?.summary.cmac_missing_price)&&<p role="status">{count(data?.summary.cmac_missing_price)} completed jobs have no recorded price and are excluded from the value.</p>}{Boolean(data?.summary.cmac_zero_price)&&<p>{count(data?.summary.cmac_zero_price)} completed jobs have a recorded price of £0.</p>}</article></section>
 <section className="hackney-detail"><article><h2>Driver category unknown</h2><strong>{count(data?.summary.unknown_driver)}</strong><p>Bookings in the selected period without a saved driver call sign. These remain unclassified.</p>{bookingLink('unknown')}<p><Link href="/admin/drivers">Open driver register →</Link></p></article><article><h2>Classification rules</h2><p>Historical bookings use the call sign saved on that booking. A Hackney driver can also carry an ordinary booked journey.</p><p>Street bookings are grouped independently. These groups overlap and must not be added together as separate totals.</p><p>Classification does not change dispatch eligibility, fares, booking outcomes or driver punctuality.</p>{data&&<small>Updated {new Date(data.checkedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK</small>}</article></section>
 <section className="hackney-settings"><h2><Settings2 size={20}/> Configuration</h2><p>Changes apply to booking grouping across the full history and future bookings. Original records remain unchanged.</p><label>Hackney call sign prefixes<input value={prefixes} disabled={loading||saving} onChange={e=>setPrefixes(e.target.value)} placeholder="9, 4"/><small>Comma-separated numeric prefixes.</small></label><label>Street / Flagdown booking sources<input value={sources} disabled={loading||saving} onChange={e=>setSources(e.target.value)} placeholder="FlaggedBooking"/><small>Exact Autocab source names. The explicit street pickup flag is always included.</small></label><button type="button" disabled={!data||loading||saving} onClick={()=>void save()}>{saving?'Saving…':'Save configuration'}</button></section>
 </main>;
}
