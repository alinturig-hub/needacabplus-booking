'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import './booking-saved-views.css';

export type BookingFilters={query:string;status:string[];source:string;payment:string;period:string;from:string;to:string;fromTime:string;toTime:string;dateField:'pickup'|'booked';group:string};
type SavedView={name:string;filters:BookingFilters};
const periods=['today','yesterday','7days','30days','custom','all'];
function validView(value:unknown):value is SavedView{
 if(!value||typeof value!=='object')return false;
 const {name,filters}=value as SavedView;
 return typeof name==='string'&&name.length>0&&name.length<=40&&!!filters&&typeof filters==='object'&&['query','source','payment','period','from','to','fromTime','toTime','dateField','group'].every(key=>typeof filters[key as keyof BookingFilters]==='string')&&Array.isArray(filters.status)&&filters.status.every(s=>typeof s==='string'&&s.length<=60)&&periods.includes(filters.period)&&['pickup','booked'].includes(filters.dateField);
}
export default function BookingSavedViews({filters,onApply,scope}:{filters:BookingFilters;onApply:(filters:BookingFilters)=>void;scope:string}){
 const [views,setViews]=useState<SavedView[]>([]),[name,setName]=useState(''),[ready,setReady]=useState(false),[message,setMessage]=useState('');
 const key='nac-booking-views-v1-'+scope;
 useEffect(()=>{const timer=setTimeout(()=>{try{const saved:unknown=JSON.parse(localStorage.getItem(key)||'[]');setViews(Array.isArray(saved)?saved.filter(validView).slice(0,20):[])}catch{setViews([])}setReady(true)},0);return()=>clearTimeout(timer)},[key]);
 function persist(next:SavedView[]){try{localStorage.setItem(key,JSON.stringify(next));setViews(next);return true}catch{setMessage('Unable to save views in this browser.');return false}}
 function save(){const label=name.trim();if(!label)return;if(filters.period==='custom'&&(!filters.from||!filters.to||filters.from>filters.to||(filters.from===filters.to&&filters.fromTime>filters.toTime))){setMessage('Choose a valid date range before saving.');return}if(views.some(view=>view.name.toLowerCase()===label.toLowerCase())){setMessage('Choose a different name; this view already exists.');return}if(views.length>=20){setMessage('Remove a saved view before adding another (maximum 20).');return}if(persist([...views,{name:label,filters}])){setName('');setMessage('View saved in this browser.')}}
 const shortcuts:[string,string[]][]=[['All statuses',[]],['In progress',['Dispatched','Driver Accepted','Arrived','Passenger On Board']],['Completed',['Completed']],['Cancelled',['Cancelled']],['No fare',['No Fare']]];
 return <section className="booking-views" aria-label="Booking views"><div className="booking-view-shortcuts"><strong>Views</strong>{shortcuts.map(([label,status])=><button type="button" key={label} aria-pressed={JSON.stringify(filters.status)===JSON.stringify(status)} onClick={()=>onApply({...filters,status})}>{label}</button>)}</div><details><summary>Saved filters{views.length?` (${views.length})`:''}</summary><div className="booking-saved-content"><p>Save search, dates, statuses, source and payment together. Saved in this browser only; searches may contain passenger details.</p><div className="booking-saved-list">{views.map(view=><span key={view.name}><button type="button" onClick={()=>{onApply(view.filters);setMessage('Applied '+view.name)}}>{view.name}</button><button type="button" aria-label={'Delete saved view '+view.name} onClick={()=>{if(persist(views.filter(item=>item.name!==view.name)))setMessage('View removed.')}}>×</button></span>)}</div><form onSubmit={event=>{event.preventDefault();save()}}><label>View name<input value={name} maxLength={40} onChange={event=>setName(event.target.value)} placeholder="e.g. Account bookings this week"/></label><Button type="submit" variant="outline" disabled={!ready||!name.trim()}>Save current filters</Button></form><p role="status">{message}</p></div></details></section>;
}
