'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {simulateDispatch,type SimulationRules} from '@/lib/dispatch-simulation';
import styles from './dispatch-simulator.module.css';

type Plan=ReturnType<typeof simulateDispatch>;
type Overview={bookings:{id:string;external_booking_id:string;pickup:string;scheduled_at:string|null;due_time:string|null}[];webhooks:{kind:string|null;event_type:string;event_url_suffix:string;enabled:boolean;received_count:number;last_received_at:string|null}[];roadTimesConfigured:boolean};
const time=(value:number|null)=>value===null?'—':new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/London'}).format(value);
const due=Date.UTC(2030,0,1,15),start=due-30*60000;
export function DispatchSimulator({rules}:{rules:SimulationRules}){
 const [overview,setOverview]=useState<Overview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[bookingId,setBookingId]=useState('');
 const [etas,setEtas]=useState([10,14,18]),[rejected,setRejected]=useState<string[]>([]),[accepted,setAccepted]=useState<string>(),[elapsed,setElapsed]=useState(0);
 const [live,setLive]=useState<{result:Plan;calculatedAt:string;note:string}|null>(null);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function load(){try{const response=await fetch('/api/admin/dispatch-simulation',{cache:'no-store',signal:controller.signal});const data=await response.json() as Overview&{error?:string};if(!response.ok)throw new Error(data.error||'Cannot load dispatch readiness.');setOverview(data)}catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Cannot load dispatch readiness.')}finally{if(!controller.signal.aborted)timer=setTimeout(load,30000)}}
  void load();return()=>{controller.abort();clearTimeout(timer)};
 },[]);
 let example:Plan|null=null;
 try{example=simulateDispatch(due,start+elapsed*1000,etas.map((eta,i)=>({vehicleId:String(i+1),label:`Example car ${i+1}`,etaSeconds:eta*60})),rules,rejected,accepted)}catch{/* Invalid unsaved settings are explained below. */}
 function reset(){setRejected([]);setAccepted(undefined);setElapsed(0)}
 async function inspect(){setBusy(true);setError('');setLive(null);try{const response=await fetch('/api/admin/dispatch-simulation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId})});const data=await response.json() as {result:Plan;calculatedAt:string;note:string;error?:string};if(!response.ok)throw new Error(data.error||'Simulation failed.');setLive(data)}catch(reason){setError(reason instanceof Error?reason.message:'Simulation failed.')}finally{setBusy(false)}}
 return <section className={styles.panel} aria-label="Dispatch simulator">
  <header><span className={styles.badge}>SIMULATION · NO JOBS SENT</span><h3>Dispatch copilot</h3><p>Plan for arrival {rules.arrivalMinutes} minutes before pickup, with time for another driver to accept.</p></header>
  <h4>Example journey · pickup 15:00</h4><p>Editable example travel times. This is not your live fleet. Example clock: {time(start+elapsed*1000)}.</p>
  <div className={styles.grid}>{etas.map((eta,i)=><label key={i}>Car {i+1} travel time (minutes)<Input type="number" min="0" max="120" value={eta} onChange={e=>{setEtas(etas.map((value,index)=>index===i?Number(e.target.value):value));reset()}}/></label>)}</div>
  {example?<><PlanView plan={example}/><div className={styles.actions}><Button type="button" variant="outline" disabled={!example.recommended||Boolean(accepted)} onClick={()=>{if(example?.recommended){setRejected([...rejected,example.recommended.vehicleId]);setElapsed(Math.max(elapsed,((example.dispatchAt??start)-start)/1000)+rules.offerSeconds)}}}>Simulate refusal</Button><Button type="button" variant="outline" disabled={!example.recommended||Boolean(accepted)} onClick={()=>setAccepted(example?.recommended?.vehicleId)}>Simulate acceptance</Button><Button type="button" variant="outline" onClick={reset}>Reset example</Button></div></>:<p role="alert">Check the simulation rules above.</p>}
  <p>The midpoint is shown for comparison. The dispatch time also allows for the slowest selected backup, each acceptance window and your travel buffer.</p>
  <hr/><h4>Inspect a real booking</h4><p>Uses saved rules and fresh fleet positions. Checks only working, non-suspended CLEAR vehicles with no current allocation. This snapshot does not reserve cars across bookings.</p>
  {overview&&!overview.roadTimesConfigured&&<p className={styles.notice}>Travel times use GPS tracks and your speed/distance settings. They are approximate, without road routing or live traffic.</p>}
  <div className={styles.actions}><select aria-label="Booking to simulate" value={bookingId} onChange={e=>{setBookingId(e.target.value);setLive(null)}}><option value="">Choose an awaiting booking</option>{overview?.bookings.map(booking=><option key={booking.id} value={booking.id}>#{booking.external_booking_id} · {booking.pickup}</option>)}</select><Button type="button" disabled={busy||!bookingId} onClick={inspect}>{busy?'Calculating…':'Simulate booking'}</Button></div>
  {overview?.bookings.length===0&&<p>No awaiting bookings found.</p>}{error&&<p role="alert" className={styles.notice}>{error}</p>}
  {live&&<><p>Snapshot: {new Date(live.calculatedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})}. Recalculate after changes.</p><PlanView plan={live.result}/><p>{live.note}</p></>}
  <h4>Webhook readiness</h4><p>Receipt counters update every 30 seconds while this panel is open. Receiving an event does not yet confirm its booking and vehicle mapping.</p>
  <ul>{['/booking_dispatch','/booking_accepted','/booking_rejected'].map(path=>{const hook=overview?.webhooks.find(row=>row.event_url_suffix===path);return <li key={path}><strong>{path}</strong><span>{!overview?(error?'Unavailable':'Loading…'):!hook?'Not configured':!hook.enabled?'Disabled':`${hook.received_count} received · ${hook.kind||'event mapping needs review'}`}{hook?.last_received_at?` · Last: ${new Date(hook.last_received_at).toLocaleString('en-GB',{timeZone:'Europe/London'})}`:''}</span></li>})}</ul>
 </section>;
}
function PlanView({plan}:{plan:Plan}){return <div aria-live="polite"><div className={styles.results}><div><small>Recommended</small><strong>{plan.recommended?.label||(plan.state==='accepted'?'Accepted — stop offers':'No candidate')}</strong></div><div><small>Arrival target</small><strong>{time(plan.targetAt)}</strong></div><div><small>Dispatch by</small><strong>{time(plan.dispatchAt)}</strong></div><div><small>Travel midpoint</small><strong>{plan.midpointSeconds===null?'—':`${(plan.midpointSeconds/60).toFixed(1)} min`}</strong></div></div>{plan.warning&&<p className={styles.notice}>{plan.warning}</p>}<ol>{plan.candidates.map((car,i)=><li key={car.vehicleId}>{i===0?'First choice':'Backup'}: {car.label} · {(car.etaSeconds/60).toFixed(1)} min</li>)}</ol></div>}
