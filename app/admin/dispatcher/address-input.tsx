'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {MapPin} from 'lucide-react';
import styles from './workspace.module.css';

export type AddressChoice={address:string;fullAddress:Record<string,unknown>|null;placeID?:string|null;customAddressID?:string|number|null};

export default function DispatcherAddressInput({label,placeholder,value,selected,onChange,onSelect}:{label:string;placeholder:string;value:string;selected:AddressChoice|null;onChange:(value:string)=>void;onSelect:(choice:AddressChoice)=>void}){
 const id=useId();
 const [items,setItems]=useState<AddressChoice[]>([]);
 const [open,setOpen]=useState(false);
 const [loading,setLoading]=useState(false);
 const [resolving,setResolving]=useState(false);
 const [message,setMessage]=useState('');
 const [active,setActive]=useState(-1);
 const sequence=useRef(0);
 const host=useRef<HTMLDivElement>(null);

 useEffect(()=>{
  if(selected||value.trim().length<2)return;
  const current=++sequence.current;
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setLoading(true);
   try{
    const response=await fetch(`/api/address/search?q=${encodeURIComponent(value.trim())}`,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error('Address search is temporarily unavailable.');
    const data=await response.json() as {items?:AddressChoice[]};
    if(current!==sequence.current)return;
    const next=Array.isArray(data.items)?data.items:[];
    setItems(next);setMessage(next.length?'':'No addresses found.');setActive(-1);setOpen(true);
   }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')return;
    if(current===sequence.current){setItems([]);setMessage('Address search is temporarily unavailable.');setOpen(true)}
   }finally{if(current===sequence.current)setLoading(false)}
  },180);
  return()=>{clearTimeout(timer);controller.abort()};
 },[value,selected]);

 useEffect(()=>{
  const close=(event:PointerEvent)=>{if(!host.current?.contains(event.target as Node))setOpen(false)};
  document.addEventListener('pointerdown',close);
  return()=>document.removeEventListener('pointerdown',close);
 },[]);

 async function choose(item:AddressChoice){
  const current=++sequence.current;
  setOpen(false);setResolving(true);
  try{
   let choice=item;
   if(!choice.fullAddress&&choice.placeID){
    const response=await fetch(`/api/address/resolve?placeId=${encodeURIComponent(choice.placeID)}`,{cache:'no-store'});
    const data=await response.json() as {item?:AddressChoice;error?:string};
    if(!response.ok||!data.item?.fullAddress)throw new Error(data.error||'Unable to verify this address.');
    choice=data.item;
   }
   if(!choice.fullAddress)throw new Error('Unable to verify this address.');
   if(current!==sequence.current)return;
   setItems([]);setMessage('');onSelect(choice);
  }catch(error){
   if(current===sequence.current){setMessage(error instanceof Error?error.message:'Unable to verify this address.');setOpen(true)}
  }finally{if(current===sequence.current)setResolving(false)}
 }

 const zone=selected?.fullAddress?.zone;
 const zoneLabel=zone&&typeof zone==='object'&&'name' in zone&&typeof zone.name==='string'?zone.name:typeof selected?.fullAddress?.zoneName==='string'?selected.fullAddress.zoneName:null;
 return <div ref={host} className={styles.addressField}>
  <label htmlFor={id}>{label}</label>
  <input id={id} value={value} placeholder={placeholder} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={active>=0?`${id}-result-${active}`:undefined} disabled={resolving} onFocus={()=>{if(items.length||message)setOpen(true)}} onChange={event=>{sequence.current++;setItems([]);setMessage('');setOpen(false);setLoading(false);setActive(-1);onChange(event.target.value)}} onKeyDown={event=>{
   if(event.key==='Escape'){setOpen(false);return}
   if(event.key==='ArrowDown'&&open&&items.length){event.preventDefault();setActive(index=>(index+1)%items.length)}
   if(event.key==='ArrowUp'&&open&&items.length){event.preventDefault();setActive(index=>index<=0?items.length-1:index-1)}
   if(event.key==='Enter'&&open&&active>=0&&items[active]){event.preventDefault();void choose(items[active])}
  }}/>
  {(loading||resolving)&&<span className={styles.addressHint} role="status">{resolving?'Checking address…':'Searching addresses…'}</span>}
  {selected&&!loading&&!resolving&&<span className={styles.addressHint}><MapPin size={12}/> Address verified{zoneLabel?` · ${zoneLabel}`:''}</span>}
  {open&&(items.length>0||message)&&<div id={`${id}-results`} role="listbox" aria-label={`${label} suggestions`} className={styles.addressResults}>
   {items.map((item,index)=><button key={`${item.placeID||item.customAddressID||item.address}-${index}`} id={`${id}-result-${index}`} type="button" role="option" aria-selected={active===index} disabled={resolving} onMouseDown={event=>event.preventDefault()} onClick={()=>void choose(item)}><MapPin size={15}/><span>{item.address}</span></button>)}
   {message&&<span className={styles.addressEmpty}>{message}</span>}
  </div>}
 </div>;
}
