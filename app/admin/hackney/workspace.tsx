'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import {CarTaxiFront,RefreshCw,Settings2} from 'lucide-react';
import './workspace.css';
type Data={policy:{prefixes:string[];flaggedSources:string[]};summary:{hackney:number;street:number;overlap:number;unknown_driver:number;hackney_today:number};checkedAt:string};
const count=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('en-GB');
export default function HackneyWorkspace(){
 const [data,setData]=useState<Data|null>(null),[prefixes,setPrefixes]=useState(''),[sources,setSources]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const response=await fetch('/api/admin/hackney',{cache:'no-store'});const next=await response.json() as Data&{error?:string};if(!response.ok)throw Error(next.error||'Unable to load Hackney data.');setData(next);setPrefixes(next.policy.prefixes.join(', '));setSources(next.policy.flaggedSources.join(', '))}catch(e){setError(e instanceof Error?e.message:'Unable to load Hackney data.')}finally{setLoading(false)}
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer)},[load]);
 async function save(){
  setSaving(true);setError('');setNotice('');
  try{const response=await fetch('/api/admin/hackney',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:prefixes.split(',').map(s=>s.trim()).filter(Boolean),flaggedSources:sources.split(',').map(s=>s.trim()).filter(Boolean)})});const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||'Unable to save');await load();setNotice('Configuration saved. Booking groups now use these rules across the saved history and new bookings.')}catch(e){setError(e instanceof Error?e.message:'Unable to save configuration.')}finally{setSaving(false)}
 }
 return <main className="hackney-workspace"><header><div><small>OPERATIONS</small><h1><CarTaxiFront/> Hackney</h1><p>Hackney activity and street bookings, with a clear distinction between driver category and booking origin.</p></div><button type="button" disabled={loading||saving} onClick={()=>void load()}><RefreshCw size={17}/>{loading?'Loading…':'Refresh'}</button></header>
 {error&&<p role="alert" className="hackney-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <section className="hackney-cards" aria-label="Hackney overview">{[
 ['Hackney bookings',data?.summary.hackney,'All saved bookings assigned to a Hackney call sign.','hackney'],
 ['Street / Flagdown',data?.summary.street,'Street pickup flag or a configured street booking source.','street'],
 ['Hackney + Street',data?.summary.overlap,'Street bookings assigned to a Hackney driver.','hackney-street'],
 ].map(([label,value,description,group])=><article key={String(group)}><h2>{label}</h2><strong>{count(value as number|undefined)}</strong><p>{description}</p><Link href={`/admin/bookings?group=${group}`}>View bookings →</Link></article>)}</section>
 <section className="hackney-detail"><article><h2>Today · UK pickup date</h2><strong>{count(data?.summary.hackney_today)}</strong><p>Hackney bookings scheduled for today. Figures above cover the full saved history.</p><p>{count(data?.summary.unknown_driver)} bookings have no saved driver call sign and remain unclassified.</p><Link href="/admin/drivers">Open driver register →</Link></article><article><h2>Classification rules</h2><p>Historical bookings use the call sign saved on that booking. A Hackney driver can also carry an ordinary booked journey.</p><p>Street bookings are grouped independently. These groups overlap and must not be added together as separate totals.</p><p>Classification does not change dispatch eligibility, fares, booking outcomes or driver punctuality.</p>{data&&<small>Updated {new Date(data.checkedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK</small>}</article></section>
 <section className="hackney-settings"><h2><Settings2 size={20}/> Configuration</h2><p>Changes apply to booking grouping across the full history and future bookings. Original records remain unchanged.</p><label>Hackney call sign prefixes<input value={prefixes} disabled={loading||saving} onChange={e=>setPrefixes(e.target.value)} placeholder="9, 4"/><small>Comma-separated numeric prefixes.</small></label><label>Street / Flagdown booking sources<input value={sources} disabled={loading||saving} onChange={e=>setSources(e.target.value)} placeholder="FlaggedBooking"/><small>Exact Autocab source names. The explicit street pickup flag is always included.</small></label><button type="button" disabled={!data||loading||saving} onClick={()=>void save()}>{saving?'Saving…':'Save configuration'}</button></section>
 </main>;
}
