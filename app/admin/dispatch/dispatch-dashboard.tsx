'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Activity,CarFront,Clock3,Radio,ShieldCheck,ArrowRight,Settings2} from 'lucide-react';
import type {simulateDispatch} from '@/lib/dispatch-simulation';
import styles from './dispatch-dashboard.module.css';
import {BookingStory} from './booking-story';
import {AnalyticsPanel} from './analytics-panel';

export type Job={id:string;reference:string;pickup:string;destination:string;status:string;due_at:string|null;vehicle:string|null;updated_at:string;last_event_type:string|null;assigned:boolean};
export type LiveData={jobs:Job[];events:{id:string;event_type:string;booking_id:string|null;vehicle_id:string|null;driver_id:string|null;driver_callsign?:string|null;vehicle_callsign?:string|null;received_at:string}[];fleet:{clear:number;last_track:string|null};activeTotal:number;serverTime:string};
export type Analysis={bookingId?:string;result:ReturnType<typeof simulateDispatch>;analysis:{checkedVehicles?:number;requiredCapabilities?:string[];excluded?:{vehicleId:string;label:string;reason:string}[];eligibleVehicles:number;nearbyVehicles:number;usableEtas:number;radiusMiles:number;arrivalMinutes:number;bufferMinutes:number;offerSeconds:number};calculatedAt:string;note:string};
const waiting=(job:Job)=>!job.assigned&&['Booked','Created','Modified','Running Late'].includes(job.status);
const clock=(value:string|number|null)=>value===null||!Number.isFinite(new Date(value).getTime())?'—':new Date(value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/London'});
const dateTime=(value:string|null)=>!value||!Number.isFinite(Date.parse(value))?'Time unavailable':new Date(value).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});

export default function DispatchDashboard(){
 const [data,setData]=useState<LiveData|null>(null),[selected,setSelected]=useState(''),[error,setError]=useState(''),[analysis,setAnalysis]=useState<Analysis|null>(null),[planError,setPlanError]=useState(''),[planning,setPlanning]=useState(false),[now,setNow]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function load(){try{if(!document.hidden){const response=await fetch('/api/admin/dispatch-live',{signal:controller.signal,cache:'no-store'});const value=await response.json() as LiveData&{error?:string};if(!response.ok)throw new Error(value.error||'Unable to refresh the dashboard.');setData(value);setError('');setSelected(previous=>value.jobs.some(job=>job.id===previous)?previous:'')}}catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Connection interrupted.')}finally{if(!controller.signal.aborted)timer=setTimeout(load,5000)}}
  void load();const clockTimer=setInterval(()=>setNow(Date.now()),1000);return()=>{controller.abort();clearTimeout(timer);clearInterval(clockTimer)};
 },[]);
 const job=data?.jobs.find(item=>item.id===selected),canPlan=Boolean(job&&waiting(job));
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function load(){
   if(!selected||!canPlan){setAnalysis(null);setPlanError('');setPlanning(false);return}
   try{if(!document.hidden){setPlanning(true);setPlanError('');const response=await fetch('/api/admin/dispatch-simulation',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:selected})});const value=await response.json() as Analysis&{error?:string};if(!response.ok)throw new Error(value.error||'A recommendation is not available.');if(!controller.signal.aborted)setAnalysis({...value,bookingId:selected})}}catch(reason){if(!controller.signal.aborted){setAnalysis(null);setPlanError(reason instanceof Error?reason.message:'A recommendation is not available.')}}finally{if(!controller.signal.aborted){setPlanning(false);timer=setTimeout(load,10000)}}
  }
  // Changes of selection clear the previous job before the next request resolves.
  void load();return()=>{controller.abort();clearTimeout(timer)};
 },[selected,canPlan]);
 return <DispatchDashboardView data={data} selected={selected} onSelect={setSelected} analysis={analysis?.bookingId===selected&&canPlan?analysis:null} error={error} planError={planError} planning={planning} now={now}/>;
}

export function DispatchDashboardView({data,selected,onSelect,analysis,error='',planError='',planning=false,now}:{data:LiveData|null;selected:string;onSelect:(id:string)=>void;analysis:Analysis|null;error?:string;planError?:string;planning?:boolean;now:number}){
 const [filter,setFilter]=useState('');
 const job=data?.jobs.find(item=>item.id===selected),stale=!data||now-Date.parse(data.serverTime)>15000||Boolean(error);
 const jobs=data?.jobs.filter(item=>`${item.reference} ${item.pickup} ${item.status}`.toLowerCase().includes(filter.toLowerCase()))||[];
 const nextJob=data?.jobs.filter(waiting).filter(item=>item.due_at&&Number.isFinite(Date.parse(item.due_at))).sort((a,b)=>Date.parse(a.due_at!)-Date.parse(b.due_at!))[0];
 const events=data?.events.filter(event=>!job||event.booking_id===job.reference)||[];
 const plan=analysis?.result;
 const remaining=plan?.dispatchAt===null||plan?.dispatchAt===undefined?null:Math.ceil((plan.dispatchAt-now)/1000);
 return <div className={styles.page}>
  <header className={styles.nav}><Link className="brand" href="/admin"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link><nav aria-label="Admin navigation"><Link href="/admin">Bookings</Link><Link href="/admin/dispatch" aria-current="page">Dispatch Live</Link><Link href="/admin/drivers">Drivers</Link><Link href="/admin/vehicles">Vehicles</Link><Link href="/admin/live-map">Clear Map</Link><Link href="/admin/configuration">Configuration</Link></nav></header>
  <main className={styles.main}>
   <div className={styles.heading}><div><span className={styles.eyebrow}>OPERATIONS · DISPATCH COPILOT</span><h1>Every job. Every decision.</h1><p>Follow recommendations and incoming Autocab events as they happen.</p></div><div className={styles.connection}><span className={stale?styles.amber:styles.green}/>{stale?(data?'Updates delayed':'Connecting…'):'Connected · 5s refresh'}<small>Last update {clock(data?.serverTime||null)} · UK time</small></div></div>
   <div className={styles.banner}><ShieldCheck size={20}/><div><strong>Simulation mode — automatic sending is off</strong><span>Recommendations are calculated by dispatch rules. Autocab events show external activity; this dashboard does not send or reserve a job.</span></div><Link href="/admin/configuration"><Settings2 size={16}/>Dispatch settings</Link></div>
   {error&&<p className={styles.warning} role="alert">{error} Previously loaded data may be out of date.</p>}
   <div className={styles.stats}><Stat icon={<Activity/>} label="Active bookings" value={data?.activeTotal}/><Stat icon={<Clock3/>} label="Awaiting · displayed list" value={data?.jobs.filter(waiting).length}/><Stat icon={<CarFront/>} label="Fresh CLEAR tracks · all fleet" value={data?.fleet.clear}/><Stat icon={<Radio/>} label="Accepted · displayed list" value={data?.jobs.filter(item=>item.status==='Driver Accepted').length}/></div>
   {nextJob&&<button className={styles.nextJob} onClick={()=>onSelect(nextJob.id)}><div><small>NEXT AWAITING JOB · DISPLAYED QUEUE</small><strong>Booking #{nextJob.reference}</strong><span>{nextJob.pickup}</span></div><div><strong>{dateTime(nextJob.due_at)}</strong><span>Awaiting driver offer · view journey →</span></div></button>}
   <div className={styles.workspace}>
    <section className={styles.queue}><div className={styles.sectionTitle}><h2>Job queue</h2><span>{data?.jobs.length||0} / {data?.activeTotal||0}</span></div><p className={styles.small}>Latest 100 active records. Updated by received booking events.</p><input aria-label="Search jobs" placeholder="Find booking, pickup or status…" value={filter} onChange={e=>setFilter(e.target.value)}/><div className={styles.jobList}>{jobs.map(item=><button key={item.id} className={`${styles.job} ${selected===item.id?styles.selected:''}`} onClick={()=>onSelect(item.id)}><div><strong>#{item.reference}</strong><span>{item.status}</span></div><p>{item.pickup}</p><small><Clock3 size={12}/>{dateTime(item.due_at)}{item.vehicle?` · Car ${item.vehicle}`:''}</small></button>)}{!jobs.length&&<p className={styles.empty}>{data?'No matching active jobs.':'Loading bookings…'}</p>}</div></section>
    <section className={styles.detail} aria-label="Booking analysis"><div className={styles.sectionTitle}><h2>{job?`Booking #${job.reference}`:'Select a booking'}</h2><span>{planning?'Calculating…':'Recommendation'}</span></div>
     {job?<><div className={styles.journey}><span>●</span><div><small>PICKUP · {dateTime(job.due_at)}</small><p>{job.pickup}</p></div><span>■</span><div><small>DESTINATION</small><p>{job.destination}</p></div></div>
      <BookingStory key={job.reference} reference={job.reference}/>
      {!waiting(job)&&<div className={styles.warning}><strong>Autocab status: {job.status}</strong><p>{job.vehicle?`Assigned vehicle: ${job.vehicle}. `:''}No new recommendation is generated for this state. It requires tracking or operator review.</p></div>}
      {planError&&<div className={styles.warning} role="alert"><strong>Vehicle matching unavailable</strong><p>{planError}</p><small>No offer was sent.</small></div>}
      {waiting(job)&&!plan&&!planError&&<p className={styles.empty}>Checking pickup, requirements and available vehicles…</p>}
      {analysis&&plan&&<><div className={styles.planHeader}><div><small>RECOMMENDED VEHICLE</small><h3>{plan.recommended?.label||'No eligible candidate'}</h3><p>Calculated {clock(analysis.calculatedAt)}{now-Date.parse(analysis.calculatedAt)>25000?' · OUT OF DATE':''}</p></div><div><small>DISPATCH BY · PROPOSED</small><strong>{clock(plan.dispatchAt)}</strong><p>{remaining===null?'Review required':remaining<=0?'Window reached — review now':`In ${Math.floor(remaining/60)}m ${remaining%60}s`}</p></div></div>
       <div className={styles.steps}><h3>How this recommendation was calculated</h3><Step number="1" title="Check the job" text={`Pickup validated. Arrival target ${clock(plan.targetAt)} — ${analysis.analysis.arrivalMinutes} minutes early.`}/><Step number="2" title="Find available vehicles" text={`${analysis.analysis.eligibleVehicles} eligible CLEAR vehicles; ${analysis.analysis.nearbyVehicles} nearby checked within ${analysis.analysis.radiusMiles} miles (up to 20). Suspended, off-shift and allocated vehicles excluded.`}/><Step number="3" title="Compare travel estimates" text={`${analysis.analysis.usableEtas} usable estimates. ${plan.candidates.length} candidates selected within the travel-time limit.`}/><Step number="4" title="Allow for a backup" text={`${analysis.analysis.offerSeconds}s per acceptance window + ${analysis.analysis.bufferMinutes} min travel buffer. Midpoint: ${plan.midpointSeconds===null?'unavailable':`${(plan.midpointSeconds/60).toFixed(1)} min`}.`}/></div>
       {analysis.analysis.requiredCapabilities&&<p className={styles.small}>Required capability IDs: {analysis.analysis.requiredCapabilities.join(', ')||'None'}. {analysis.analysis.checkedVehicles??analysis.analysis.eligibleVehicles} working CLEAR vehicles checked against booking requirements.</p>}
       {Boolean(analysis.analysis.excluded?.length)&&<details className={styles.story}><summary>Why other vehicles were excluded ({analysis.analysis.excluded?.length} shown)</summary>{analysis.analysis.excluded?.map(row=><p className={styles.small} key={row.vehicleId}>Vehicle {row.label}: {row.reason}</p>)}</details>}
       {plan.warning&&<p className={styles.warning}>{plan.warning}</p>}
       <div className={styles.candidates}><h3>Candidate order</h3>{plan.candidates.map((car,i)=><div key={car.vehicleId}><span>{i+1}</span><div><strong>{car.label}</strong><small>{i===0?'First choice':'Backup'} · Autocab vehicle ID {car.vehicleId}</small></div><b>{(car.etaSeconds/60).toFixed(1)} min</b></div>)}</div><p className={styles.small}>{analysis.note}</p><p className={styles.small}>Each booking is evaluated separately. A recommendation does not reserve a car against other bookings.</p></>}
     </>:<p className={styles.empty}>Choose a job to see candidate vehicles, estimated arrival and the proposed dispatch time.</p>}
    </section>
    <section className={styles.feed}><div className={styles.sectionTitle}><h2>Autocab activity</h2><Radio size={16}/></div><p className={styles.small}>{job?`Receipts linked to #${job.reference}`:'Latest dispatch event receipts'}. Receipt order, not necessarily event order. Repeated deliveries may appear.</p><div className={styles.events}>{events.map(event=><article key={event.id}><span className={styles.eventDot}/><time>{dateTime(event.received_at)} · {clock(event.received_at)}</time><strong>{event.event_type}</strong><p>Booking {event.booking_id||'ID unavailable'}{event.driver_callsign?` · Driver ${event.driver_callsign}`:event.driver_id?` · Driver ID ${event.driver_id}`:''}{event.vehicle_callsign?` · Vehicle ${event.vehicle_callsign}`:event.vehicle_id?` · Vehicle ID ${event.vehicle_id}`:''}</p><small>Received from Autocab</small></article>)}{!events.length&&<p className={styles.empty}>No recorded receipts for this view. History starts with this dashboard release.</p>}</div><div className={styles.track}><CarFront size={18}/><div><strong>Latest track position</strong><p>{dateTime(data?.fleet.last_track||null)}</p></div></div>{job&&<button className={styles.textButton} onClick={()=>onSelect('')}>Show all event receipts <ArrowRight size={14}/></button>}</section>
   </div>
   <AnalyticsPanel/>
  </main>
 </div>;
}
function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:number|undefined}){return <div><span>{label}{icon}</span><strong>{value??'—'}</strong></div>}
function Step({number,title,text}:{number:string;title:string;text:string}){return <div><span>{number}</span><div><strong>{title}</strong><p>{text}</p></div></div>}
