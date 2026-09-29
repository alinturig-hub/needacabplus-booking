'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';

type Audit={total:number;checkedAt:string;ourReference:{filled:number;empty:number;needACabPlus:number;other:number;otherExamples:{bookingId:string;value:string}[]};yourReferences:{slot:number;filled:number;examples:string[]}[]};

export default function BookingReferenceAudit(){
 const [audit,setAudit]=useState<Audit|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function check(){setBusy(true);setError('');try{const response=await fetch('/api/admin/booking-reference-audit',{cache:'no-store'}),data=await response.json() as Audit&{error?:string};if(!response.ok)throw new Error(data.error||'Unable to check booking references.');setAudit(data)}catch(reason){setError(reason instanceof Error?reason.message:'Unable to check booking references.')}finally{setBusy(false)}}
 return <section className="customer-settings-group booking-reference-audit"><header><div><h4>Booking origin marker</h4><p>Checks every locally imported Autocab booking without changing it. Need A Cab Plus bookings use a unique <code>NAC-&lt;booking ID&gt;</code> value in <code>ourReference</code>.</p></div><Button type="button" disabled={busy} onClick={check}>{busy?'Checking all bookings…':'Check all booking references'}</Button></header>
 {error&&<p className="error-message" role="alert">{error}</p>}
 {audit&&<><div className="reference-audit-stats"><div><strong>{audit.total}</strong><span>Bookings checked</span></div><div><strong>{audit.ourReference.empty}</strong><span>Empty ourReference</span></div><div><strong>{audit.ourReference.needACabPlus}</strong><span>Need A Cab Plus</span></div><div><strong>{audit.ourReference.other}</strong><span>Other references</span></div></div><p className="customer-settings-hint">Checked {new Date(audit.checkedAt).toLocaleString()}. yourReferences used: {audit.yourReferences.filter(item=>item.filled).map(item=>`${item.slot}: ${item.filled}`).join(' · ')||'none'}.</p>{audit.ourReference.otherExamples.length>0&&<details className="customer-sms-advanced"><summary>Other ourReference examples</summary>{audit.ourReference.otherExamples.map(item=><p key={item.bookingId+'-'+item.value}>Autocab #{item.bookingId}: <code>{item.value}</code></p>)}</details>}</>}
 </section>;
}
