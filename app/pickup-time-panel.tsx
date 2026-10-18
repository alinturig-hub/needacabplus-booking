'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {defaultPickupFields,londonFields,londonPickupIso,MAX_PICKUP_DAYS} from '@/lib/pickup-schedule';
import RideOverlay from './ride-overlay';
export default function PickupTimePanel({value,minimum,onClose,onApply}:{value:string|null;minimum:number;onClose:()=>void;onApply:(value:string|null)=>void}){
 const [openedAt]=useState(Date.now);
 const [initial]=useState(()=>value?londonFields(Date.parse(value)):defaultPickupFields(minimum,openedAt));
 const [date,setDate]=useState(initial.date),[time,setTime]=useState(initial.time),[error,setError]=useState('');
 return <RideOverlay title="Select pick-up time" onClose={onClose}><p className="ride-overlay-intro">From {minimum} minutes to {MAX_PICKUP_DAYS} days in advance</p><div className="pickup-time-fields"><label>Date<input type="date" value={date} min={londonFields(openedAt).date} max={londonFields(openedAt+MAX_PICKUP_DAYS*86400000).date} onChange={e=>{setDate(e.target.value);setError('')}}/></label><label>Pick-up time<input type="time" step={300} value={time} onChange={e=>{setTime(e.target.value);setError('')}}/></label></div><p className="muted">UK time · Europe/London</p><p className="small-note">Availability is confirmed when you book.</p>{error&&<p role="alert" className="error-message">{error}</p>}<div className="ride-overlay-footer"><button type="button" className="text-link" onClick={()=>onApply(null)}>Ride as soon as possible</button><Button type="button" className="primary-action" onClick={()=>{try{onApply(londonPickupIso(date,time,minimum))}catch(e){setError(e instanceof Error?e.message:'Choose a valid time.')}}}>Continue</Button></div></RideOverlay>;
}
