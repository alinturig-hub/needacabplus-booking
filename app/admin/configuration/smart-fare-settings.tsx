'use client';
import {useEffect,useState} from 'react';
import type {QuotePolicy} from '@/lib/quote-policy';
import BookingCapabilities from './booking-capabilities';
import {Input} from '@/components/ui/input';

type Signal={waiting:number|null;clear:number|null;fresh:boolean;quiet:boolean;reason:string};
export default function SmartFareSettings({value,onChange,disabled}:{value:QuotePolicy;onChange:(next:QuotePolicy)=>void;disabled:boolean}){
 const [signal,setSignal]=useState<Signal|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  const refresh=async()=>{try{const response=await fetch('/api/admin/quote-settings',{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error();const data=await response.json() as {smartFare?:Signal};if(!controller.signal.aborted)setSignal(data.smartFare??null)}catch{if(!controller.signal.aborted)setSignal(null)}};
  void refresh();const timer=setInterval(refresh,30000);return()=>{controller.abort();clearInterval(timer)};
 },[]);
 return <section className="smart-fare-settings">
  <header><span className="pricing-chip">NOW · SMART FARE</span><h4>Lower fares when it is quiet</h4><p>NOW uses the normal Autocab fare, with no service addition. Smart Fare can replace it only with a lower Autocab quote.</p></header>
  <div className="settings-grid">
   <label><span className="field-label">Smart Fare mode</span><select value={value.smartFareMode} onChange={e=>onChange({...value,smartFareMode:e.target.value as QuotePolicy['smartFareMode']})}><option value="off">Off — normal fare</option><option value="shadow">Shadow — evaluate, keep normal fare</option><option value="live">Live — offer lower fares when quiet</option></select></label>
   <label><span className="field-label">Minimum CLEAR cars</span><Input type="number" min={1} max={1000} value={value.smartFareMinClear} onChange={e=>onChange({...value,smartFareMinClear:Number(e.target.value)})}/></label>
   <label><span className="field-label">Maximum waiting jobs per CLEAR car</span><Input type="number" min={0} max={1} step={0.05} value={value.smartFareMaxWaitingRatio} onChange={e=>onChange({...value,smartFareMaxWaitingRatio:Number(e.target.value)})}/><small>0.25 means at most 1 waiting job per 4 CLEAR cars.</small></label>
   <label><span className="field-label">Maximum data age (seconds)</span><Input type="number" min={15} max={300} value={value.smartFareFreshnessSeconds} onChange={e=>onChange({...value,smartFareFreshnessSeconds:Number(e.target.value)})}/></label>
   <label><span className="field-label">Include jobs due in the next (minutes)</span><Input type="number" min={1} max={120} value={value.demandWindowMinutes} onChange={e=>onChange({...value,demandWindowMinutes:Number(e.target.value)})}/><small>Also used by the existing Priority demand settings.</small></label>
  </div>
  <p className="customer-settings-hint">Uses current fleet-wide supply and unassigned jobs due within the booking window, including overdue jobs. Both vehicle positions and booking updates must be recent. No postcode, historical-demand or ETA model is applied yet. Missing signals keep the normal fare.</p>
  <p role="status">Saved-rule signal: {signal?`${signal.quiet?'Quiet':'Normal fare'} · ${signal.clear??'—'} CLEAR cars · ${signal.waiting??'—'} waiting · ${signal.reason}`:'Unavailable — normal fare'}.</p>
  <div className="service-price-grid">
   <section className="service-price-card"><h5>NOW / ASAP · quiet-time capabilities</h5><p>Added only when the Smart Fare conditions pass. Default: 42 · Discounted Fare.</p><BookingCapabilities value={value.smartFareCapabilities} onChange={smartFareCapabilities=>onChange({...value,smartFareCapabilities})} disabled={disabled}/></section>
   {(['asap','priority','prebook','guarantee'] as const).map(service=><section key={service} className="service-price-card"><h5>{service==='asap'?'NOW / ASAP · standard capabilities':service==='priority'?'Priority · capabilities':service==='prebook'?'Pre-book · capabilities':'Guarantee · capabilities'}</h5><p>{service==='asap'?'Always applied to NOW. Keep discount-only capabilities in the quiet-time selection above.':'Applied only to this service, before its configured addition.'}</p><BookingCapabilities value={value.serviceCapabilities[service]} onChange={ids=>onChange({...value,serviceCapabilities:{...value.serviceCapabilities,[service]:ids}})} disabled={disabled}/></section>)}
  </div>
  <p className="customer-settings-hint">Shared booking capabilities are retained, except 42 and quiet-time capabilities. Priority, Pre-book and Guarantee receive those only if explicitly selected here. Save live fare settings to apply.</p>
 </section>;
}
