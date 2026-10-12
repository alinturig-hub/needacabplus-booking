'use client';

import {useEffect,useState,type FormEvent} from 'react';
import {Calculator,Plus,Save,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {calculateLocalFare,defaultLocalTariffRules,type LocalTariffRules} from '@/lib/local-tariffs';

type Category='saloon'|'estate'|'xl';
type TariffRow={id:Category;base_pence:number;per_mile_pence:number;minimum_pence:number;updated_at:string};
type Draft={id:Category;base:string;perMile:string;minimum:string};
const categories:Category[]=['saloon','estate','xl'];
const labels:Record<Category,string>={saloon:'Saloon',estate:'Estate',xl:'XL'};
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const pounds=(pence:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
const toPounds=(pence:number)=>(pence/100).toFixed(2);
const toPence=(value:string)=>Math.round(Number(value)*100);
const validMoney=(value:string,allowZero=false)=>/^\d+(?:\.\d{1,2})?$/.test(value)&&toPence(value)>=(allowZero?0:1)&&toPence(value)<=100000;

export default function LocalTariffs(){
 const [rows,setRows]=useState<Draft[]>([]);
 const [rules,setRules]=useState<LocalTariffRules>(defaultLocalTariffRules);
 const [zones,setZones]=useState<string[]>([]);
 const [airportDraft,setAirportDraft]=useState('');
 const [updatedAt,setUpdatedAt]=useState('');
 const [miles,setMiles]=useState('5');
 const [pickupZone,setPickupZone]=useState('');
 const [destinationZone,setDestinationZone]=useState('');
 const [pickupLocal,setPickupLocal]=useState('');
 const [waitingMinutes,setWaitingMinutes]=useState('0');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');

 useEffect(()=>{
  const controller=new AbortController();
  Promise.all([
   fetch('/api/tariffs',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json() as {tariffs?:TariffRow[];error?:string};if(!response.ok)throw new Error(data.error||'Unable to load local tariffs.');return data.tariffs||[]}),
   fetch('/api/admin/local-tariff-rules',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json() as {rules:LocalTariffRules;zones:string[];updatedAt:string|null;error?:string};if(!response.ok)throw new Error(data.error||'Unable to load tariff rules.');return data}),
  ]).then(([tariffs,configuration])=>{
   if(categories.some(id=>!tariffs.some(row=>row.id===id)))throw new Error('Local tariff categories are incomplete.');
   setRows(categories.map(id=>{const row=tariffs.find(item=>item.id===id)!;return {id,base:toPounds(row.base_pence),perMile:toPounds(row.per_mile_pence),minimum:toPounds(row.minimum_pence)}}));
   setRules(configuration.rules);setZones(configuration.zones);setUpdatedAt(configuration.updatedAt||tariffs[0]?.updated_at||'');
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Unable to load local tariffs.')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[]);

 function update(id:Category,field:keyof Omit<Draft,'id'>,value:string){setRows(current=>current.map(row=>row.id===id?{...row,[field]:value}:row));setMessage('')}
 function updateZoneRule(id:string,patch:Partial<LocalTariffRules['zoneRules'][number]>){setRules(current=>({...current,zoneRules:current.zoneRules.map(rule=>rule.id===id?{...rule,...patch}:rule)}));setMessage('')}
 function updateTimeRule(id:string,patch:Partial<LocalTariffRules['timeRules'][number]>){setRules(current=>({...current,timeRules:current.timeRules.map(rule=>rule.id===id?{...rule,...patch}:rule)}));setMessage('')}
 const valid=rows.length===3&&rows.every(row=>validMoney(row.base,true)&&validMoney(row.perMile)&&validMoney(row.minimum))&&rules.zoneRules.every(rule=>rule.name.trim().length>=2&&(rule.pickupZone.trim()||rule.destinationZone.trim()))&&rules.timeRules.every(rule=>rule.name.trim().length>=2&&rule.days.length>0);
 const testMiles=Number(miles),testWaiting=Number(waitingMinutes),validPreview=Number.isFinite(testMiles)&&testMiles>=0&&testMiles<=1000&&Number.isFinite(testWaiting)&&testWaiting>=0&&testWaiting<=10000;
 async function save(event:FormEvent){
  event.preventDefault();setError('');setMessage('');
  if(!valid){setError('Complete all tariff amounts and rules before saving.');return}
  setSaving(true);
  try{
   const response=await fetch('/api/admin/local-tariff-rules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({tariffs:rows.map(row=>({id:row.id,basePence:toPence(row.base),perMilePence:toPence(row.perMile),minimumPence:toPence(row.minimum)})),rules})});
   const data=await response.json() as {error?:string};
   if(!response.ok)throw new Error(data.error||'Unable to save local tariffs.');
   setUpdatedAt(new Date().toISOString());setMessage('Local tariffs and rules saved. Customer quotes continue to use Autocab.');
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save local tariffs.')}finally{setSaving(false)}
 }
 const preview=valid&&validPreview?rows.map(row=>({id:row.id,...calculateLocalFare({basePence:toPence(row.base),perMilePence:toPence(row.perMile),minimumPence:toPence(row.minimum)},rules,{miles:testMiles,pickupZone,destinationZone,pickupLocal,waitingMinutes:testWaiting})})):[];

 return <section className="local-tariff-workspace pricing-workspace-section">
  <header className="pricing-section-heading"><span><Calculator/></span><div><h4>Need A Cab Plus local tariffs</h4><p>Build your own vehicle, zone, airport, time and waiting rules. All amounts are in pounds.</p></div></header>
  <p className="local-tariff-notice">Customer bookings currently use live Autocab quotes. Local rules are saved and tested here, without changing customer prices or existing bookings.</p>
  {loading?<p>Loading local tariffs…</p>:rows.length>0?<form onSubmit={save}>
   <h5>Vehicle rates</h5><div className="local-tariff-grid">{rows.map(row=><fieldset key={row.id}><legend>{labels[row.id]}</legend><label>Starting fare (£)<input type="number" inputMode="decimal" min="0" max="1000" step="0.01" value={row.base} onChange={event=>update(row.id,'base',event.target.value)}/></label><label>Per mile (£)<input type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" value={row.perMile} onChange={event=>update(row.id,'perMile',event.target.value)}/></label><label>Minimum fare (£)<input type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" value={row.minimum} onChange={event=>update(row.id,'minimum',event.target.value)}/></label></fieldset>)}</div>
   <div className="local-rule-section"><header><div><h5>Zone charges</h5><p>Add a charge when the pickup zone, destination zone, or both match. Zone names come from TaxiCRM when available.</p></div><Button type="button" variant="outline" onClick={()=>setRules(current=>({...current,zoneRules:[...current.zoneRules,{id:crypto.randomUUID(),name:'Zone charge',enabled:true,pickupZone:'',destinationZone:'',amountPence:0}]}))}><Plus/>Add zone rule</Button></header><datalist id="local-tariff-zones">{zones.map(zone=><option key={zone} value={zone}/>)}</datalist>{rules.zoneRules.map(rule=><div className="local-rule-row" key={rule.id}><label>Rule name<input value={rule.name} onChange={event=>updateZoneRule(rule.id,{name:event.target.value})}/></label><label>Pickup zone<input list="local-tariff-zones" value={rule.pickupZone} onChange={event=>updateZoneRule(rule.id,{pickupZone:event.target.value})} placeholder="Any"/></label><label>Destination zone<input list="local-tariff-zones" value={rule.destinationZone} onChange={event=>updateZoneRule(rule.id,{destinationZone:event.target.value})} placeholder="Any"/></label><label>Charge (£)<input type="number" min="0" max="1000" step="0.01" value={toPounds(rule.amountPence)} onChange={event=>updateZoneRule(rule.id,{amountPence:toPence(event.target.value)})}/></label><label className="local-rule-check"><input type="checkbox" checked={rule.enabled} onChange={event=>updateZoneRule(rule.id,{enabled:event.target.checked})}/>On</label><button type="button" className="local-rule-delete" aria-label={`Remove ${rule.name}`} onClick={()=>setRules(current=>({...current,zoneRules:current.zoneRules.filter(item=>item.id!==rule.id)}))}><Trash2 size={17}/></button></div>)}{rules.zoneRules.length===0&&<small>No zone charges configured.</small>}</div>
   <div className="local-rule-section"><header><div><h5>Airport charge</h5><p>Applied once when either end of a trip matches a listed airport zone.</p></div></header><div className="local-airport-row"><label>Airport zone<input list="local-tariff-zones" value={airportDraft} onChange={event=>setAirportDraft(event.target.value)} placeholder="Choose a TaxiCRM zone"/></label><Button type="button" variant="outline" disabled={!airportDraft.trim()} onClick={()=>{const name=airportDraft.trim();setRules(current=>({...current,airport:{...current.airport,zoneNames:[...new Set([...current.airport.zoneNames,name])]}}));setAirportDraft('')}}><Plus/>Add airport zone</Button><label>Airport charge (£)<input type="number" min="0" max="1000" step="0.01" value={toPounds(rules.airport.feePence)} onChange={event=>setRules(current=>({...current,airport:{...current.airport,feePence:toPence(event.target.value)}}))}/></label></div><div className="local-airport-chips">{rules.airport.zoneNames.map(zone=><button type="button" key={zone} onClick={()=>setRules(current=>({...current,airport:{...current.airport,zoneNames:current.airport.zoneNames.filter(item=>item!==zone)}}))}>{zone} ×</button>)}</div></div>
   <div className="local-rule-section"><header><div><h5>Day and time bands</h5><p>The highest matching percentage applies. Overnight bands continue into the following day.</p></div><Button type="button" variant="outline" onClick={()=>setRules(current=>({...current,timeRules:[...current.timeRules,{id:crypto.randomUUID(),name:'Time band',enabled:true,days:[0,1,2,3,4,5,6],startTime:'22:00',endTime:'06:00',percent:0}]}))}><Plus/>Add time band</Button></header>{rules.timeRules.map(rule=><div className="local-time-rule" key={rule.id}><div className="local-rule-row"><label>Rule name<input value={rule.name} onChange={event=>updateTimeRule(rule.id,{name:event.target.value})}/></label><label>From<input type="time" value={rule.startTime} onChange={event=>updateTimeRule(rule.id,{startTime:event.target.value})}/></label><label>To<input type="time" value={rule.endTime} onChange={event=>updateTimeRule(rule.id,{endTime:event.target.value})}/></label><label>Increase (%)<input type="number" min="0" max="100" step="0.1" value={rule.percent} onChange={event=>updateTimeRule(rule.id,{percent:Number(event.target.value)})}/></label><label className="local-rule-check"><input type="checkbox" checked={rule.enabled} onChange={event=>updateTimeRule(rule.id,{enabled:event.target.checked})}/>On</label><button type="button" className="local-rule-delete" aria-label={`Remove ${rule.name}`} onClick={()=>setRules(current=>({...current,timeRules:current.timeRules.filter(item=>item.id!==rule.id)}))}><Trash2 size={17}/></button></div><div className="local-day-picker">{days.map((day,index)=><button type="button" key={day} aria-pressed={rule.days.includes(index)} onClick={()=>updateTimeRule(rule.id,{days:rule.days.includes(index)?rule.days.filter(item=>item!==index):[...rule.days,index].sort()})}>{day}</button>)}</div></div>)}{rules.timeRules.length===0&&<small>No day or time bands configured.</small>}</div>
   <div className="local-rule-section"><header><div><h5>Waiting time</h5><p>Charge each started minute after the free allowance.</p></div></header><div className="local-waiting-row"><label>Free minutes<input type="number" min="0" max="180" step="1" value={rules.waiting.freeMinutes} onChange={event=>setRules(current=>({...current,waiting:{...current.waiting,freeMinutes:Number(event.target.value)}}))}/></label><label>Per minute (£)<input type="number" min="0" max="100" step="0.01" value={toPounds(rules.waiting.perMinutePence)} onChange={event=>setRules(current=>({...current,waiting:{...current.waiting,perMinutePence:toPence(event.target.value)}}))}/></label></div></div>
   <div className="local-tariff-preview"><div><strong>Test local calculation</strong><span>Base + distance, subject to minimum; then zone, airport, time band and waiting charges.</span></div><label>Journey miles<input type="number" min="0" max="1000" step="0.1" value={miles} onChange={event=>setMiles(event.target.value)}/></label><div className="local-preview-inputs"><label>Pickup zone<input list="local-tariff-zones" value={pickupZone} onChange={event=>setPickupZone(event.target.value)}/></label><label>Destination zone<input list="local-tariff-zones" value={destinationZone} onChange={event=>setDestinationZone(event.target.value)}/></label><label>Pickup date and time · UK<input type="datetime-local" value={pickupLocal} onChange={event=>setPickupLocal(event.target.value)}/></label><label>Waiting minutes<input type="number" min="0" step="1" value={waitingMinutes} onChange={event=>setWaitingMinutes(event.target.value)}/></label></div><div className="local-tariff-results">{rows.map(row=>{const result=preview.find(item=>item.id===row.id);return <span key={row.id}>{labels[row.id]} <b>{result?pounds(result.totalPence):'—'}</b></span>})}</div>{preview[0]&&<small>Example breakdown for Saloon: distance {pounds(preview[0].distancePence)} · zones {pounds(preview[0].zonePence)} · airport {pounds(preview[0].airportPence)} · time {pounds(preview[0].timePence)} · waiting {pounds(preview[0].waitingPence)}.</small>}<small>Preview only. Actual road distance and booking creation are not connected to this local calculator.</small></div>
   {error&&<p className="error-message" role="alert">{error}</p>}{message&&<p className="saved-message" role="status">{message}</p>}
   <div className="pricing-save-row"><Button disabled={saving||!valid} type="submit"><Save/>{saving?'Saving…':'Save local tariffs'}</Button>{updatedAt&&<span>Last saved {new Date(updatedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK</span>}</div>
  </form>:null}
  {!loading&&rows.length===0&&error&&<p className="error-message" role="alert">{error}</p>}
 </section>;
}
