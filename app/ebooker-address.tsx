'use client';
import {useEffect,useRef,useState} from 'react';
import EbookerLocation from './ebooker-location';
import {ebookerAddressSchema,type EbookerInput} from '@/lib/ebooker-policy';
type Stop=NonNullable<EbookerInput['pickup']>;
type Suggestion={address:string;fullAddress:unknown;placeID?:string|null};
export default function EbookerAddress({label,value,onChange,disabled=false,allowMap=false}:{label:string;value:Stop|null;onChange:(value:Stop|null)=>void;disabled?:boolean;allowMap?:boolean}){
 const selection=useRef(0);
 const [mapOpen,setMapOpen]=useState(false);
 const [text,setText]=useState(value?.text||''),[items,setItems]=useState<Suggestion[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>()=>{selection.current++},[]);
 const query=value?.text??text,searching=!disabled&&!value&&query.trim().length>=3;
 useEffect(()=>{
  if(!searching)return;
  const controller=new AbortController();const timer=setTimeout(()=>{setBusy(true);void fetch('/api/address/search?q='+encodeURIComponent(query),{signal:controller.signal}).then(async r=>{const data=await r.json() as {items?:Suggestion[];error?:string};if(!r.ok)throw Error(data.error||'Address search unavailable.');setItems(data.items||[]);setError('')}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)})},300);
  return()=>{clearTimeout(timer);controller.abort()};
 },[query,searching]);
 async function select(item:Suggestion){
  const sequence=++selection.current;setBusy(true);setError('');
  try{let full=item.fullAddress;if(!full&&item.placeID){const r=await fetch('/api/address/resolve?placeId='+encodeURIComponent(item.placeID));const data=await r.json() as {item?:{fullAddress:unknown};error?:string};if(!r.ok)throw Error(data.error||'Unable to resolve address.');full=data.item?.fullAddress}
   const source=full&&typeof full==='object'?full as Record<string,unknown>:{};
   const stop=ebookerAddressSchema.safeParse({...source,text:source.text||item.address});if(!stop.success)throw Error('Choose a complete address from the search results.');
   if(sequence!==selection.current)return;
   setText(stop.data.text);setItems([]);onChange(stop.data);
  }catch(e){setError(e instanceof Error?e.message:'Unable to select address.')}finally{setBusy(false)}
 }
 return <div className="eb-address"><label>{label}<input aria-label={label} autoComplete="off" value={query} readOnly={disabled} placeholder={label} onChange={e=>{selection.current++;setItems([]);setBusy(false);setText(e.target.value);onChange(null)}}/></label>{busy&&<small role="status">Searching…</small>}{error&&<small role="alert">{error}</small>}{searching&&!!items.length&&<ul className="eb-suggestions">{items.map((item,index)=><li key={item.address+index}><button type="button" onClick={()=>void select(item)}>{item.address}</button></li>)}</ul>}{allowMap&&!disabled&&<button type="button" className="eb-map-link" onClick={()=>{selection.current++;setItems([]);setMapOpen(true)}}>Set location on map</button>}{mapOpen&&<EbookerLocation label={label} value={value} onClose={()=>setMapOpen(false)} onApply={stop=>{selection.current++;setText(stop.text);setItems([]);onChange(stop);setMapOpen(false)}}/>}</div>;
}
