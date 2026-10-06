'use client';
import {useEffect,useId,useRef,useState} from 'react';
import type {BookingCapability} from '@/lib/autocab-capabilities';
import {Button} from '@/components/ui/button';
export default function BookingCapabilities({value,onChange,disabled}:{value:number[];onChange:(ids:number[])=>void;disabled:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
 const [items,setItems]=useState<BookingCapability[]>([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController();fetch('/api/admin/booking-capabilities',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json() as {capabilities?:BookingCapability[];error?:string};if(!response.ok||!Array.isArray(data.capabilities))throw new Error(data.error||'Unable to load capabilities.');if(active){setItems(data.capabilities);setError('')}}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Unable to load capabilities.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false;controller.abort()}},[revision]);
 const visible=items.filter(item=>(item.shortCode+' '+item.name+' '+item.id).toLowerCase().includes(query.trim().toLowerCase()));
 function toggle(id:number){onChange(value.includes(id)?value.filter(current=>current!==id):[...value,id])}
 return <div className="booking-capability-picker">
 <div className="customer-settings-actions"><Button type="button" disabled={disabled} onClick={()=>dialog.current?.showModal()}>Select booking capabilities</Button><span>{value.length} selected</span></div>
 <div className="capability-chips">{value.map(id=>{const item=items.find(item=>item.id===id);return <button key={id} type="button" disabled={disabled} onClick={()=>toggle(id)} aria-label={'Remove '+(item?.name||'capability '+id)}>{item?item.shortCode+' · '+item.name:'ID '+id+(loading?'':' · unavailable in current list')} <span aria-hidden="true">×</span></button>})}</div>
 {!value.length&&<p className="customer-settings-hint">No additional booking capabilities selected.</p>}
 {error&&<p role="alert" className="error-message">{error} Your saved selection is unchanged.</p>}
 <dialog ref={dialog} className="capability-dialog" aria-labelledby={titleId}>
 <header><h3 id={titleId}>Select booking capabilities</h3><button type="button" aria-label="Close capabilities" onClick={()=>dialog.current?.close()}>×</button></header>
 <div className="capability-filter"><input autoFocus aria-label="Filter capabilities" placeholder="Search shortcode, name or ID" value={query} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault()}} onChange={e=>setQuery(e.target.value)}/><span>{visible.length} available</span><Button type="button" disabled={loading||disabled} onClick={()=>{setLoading(true);setRevision(current=>current+1)}}>Refresh</Button></div>
 {loading?<p role="status">Loading enabled capabilities…</p>:error?<p role="alert" className="error-message">{error}</p>:<div className="capability-table"><table><thead><tr><th scope="col">Select</th><th scope="col">Shortcode</th><th scope="col">Name</th></tr></thead><tbody>{visible.map(item=><tr key={item.id} className={value.includes(item.id)?'is-selected':''}><td><input type="checkbox" aria-label={'Select '+item.name} checked={value.includes(item.id)} disabled={disabled||(!value.includes(item.id)&&value.length>=30)} onChange={()=>toggle(item.id)}/></td><td>{item.shortCode||'—'}</td><td><label><button type="button" disabled={disabled||(!value.includes(item.id)&&value.length>=30)} onClick={()=>toggle(item.id)}>{item.name}</button><small>ID {item.id}{item.requirement?' · '+item.requirement:''}</small></label></td></tr>)}</tbody></table>{!visible.length&&<p>{items.length?'No matching capabilities.':'Autocab returned no enabled capabilities.'}</p>}</div>}
 <footer><span>{value.length} selected{value.length>=30?' · selection limit reached':''} · Save settings to apply</span><Button type="button" onClick={()=>dialog.current?.close()}>Done</Button></footer>
 </dialog></div>;
}
