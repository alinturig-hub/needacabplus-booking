'use client';
import {useEffect,useState} from 'react';
import styles from './dispatch-dashboard.module.css';
type Audit={notFoundExamples?:{reference:string;local_status:string;last_event_type:string|null}[];stalled:boolean;errors:{reason:string;bookings:number}[];run:{heartbeat_at:string|null;status:string;total:number;error:string|null}|null;counts:{checked:number;errors:number;mismatches:number;changed_during_audit:number}|null;differences:{field:string;bookings:number}[];modifiedFields:{field:string;updates:number}[]};
export function DatabaseAudit(){
 const [data,setData]=useState<Audit|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function load(){try{if(!document.hidden){const response=await fetch('/api/admin/booking-audit',{signal:abort.signal,cache:'no-store'});if(!response.ok)throw new Error('Audit report unavailable');setData(await response.json());setError('')}}catch{if(!abort.signal.aborted)setError('Audit report unavailable; progress is not confirmed.')}finally{if(!abort.signal.aborted)timer=setTimeout(load,30000)}}
  void load();return()=>{abort.abort();clearTimeout(timer)};
 },[]);
 return <section className={styles.story}><h3>Database comparison · Autocab</h3>{error?<p role="alert">{error}</p>:<p>{data?.run?`${data.stalled?'No worker activity detected':data.run.status} · ${data.counts?.checked||0} / ${data.run.total} bookings checked`:'Waiting for the server audit report…'}</p>}
 {data?.run?.heartbeat_at&&<p className={styles.small}>Last worker activity: {new Date(data.run.heartbeat_at).toLocaleString('en-GB',{timeZone:'Europe/London'})}. Existing results are preserved during restart.</p>}{data?.errors?.map(item=><p key={item.reason}>{item.reason}: {item.bookings} bookings</p>)}
 {Boolean(data?.notFoundExamples?.length)&&<details><summary>Bookings not found in Autocab (404) · examples</summary><p className={styles.small}>Autocab could not find these references using the configured booking connection. This does not prove deletion. These records remain unchanged locally and the audit continues.</p>{data?.notFoundExamples?.map(item=><p key={item.reference}>#{item.reference} · local status: {item.local_status} · latest local event: {item.last_event_type||'unknown'}</p>)}</details>}
 {data?.run?.error&&<p className={styles.warning}>{data.run.error}</p>}
 {data?.counts&&<p>{data.counts.mismatches} with differences · {data.counts.errors} could not be compared · {data.counts.changed_during_audit} changed locally during comparison.</p>}
 <p className={styles.small}>One snapshot of all locally imported Autocab bookings, including closed jobs. Comparisons do not repair records. Missing API fields are unverified, not matches. Jobs changing during the audit need a fresh comparison.</p>
 <details><summary>Differences and Booking Modified activity</summary>{data?.differences.map(item=><p key={item.field}>{item.field}: {item.bookings} bookings</p>)}<h4>Fields changed by new Booking Modified events</h4>{data?.modifiedFields.map(item=><p key={item.field}>{item.field}: {item.updates} updates</p>)}<p className={styles.small}>Change history begins with this release; earlier modifications cannot be reconstructed from a last-message snapshot.</p></details></section>;
}
