'use client';
import {useEffect,useRef,useState} from 'react';
import {LocateFixed,MapPin} from 'lucide-react';
import CustomerLiveMap from './customer-live-map';
import {ebookerAddressSchema,type EbookerInput} from '@/lib/ebooker-policy';
type Stop=NonNullable<EbookerInput['pickup']>;
type Point={latitude:number;longitude:number};
export default function EbookerLocation({label,value,onClose,onApply}:{label:string;value:Stop|null;onClose:()=>void;onApply:(stop:Stop)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),sequence=useRef(0);
 const [target,setTarget]=useState<Point>(value?.coordinate||{latitude:50.3755,longitude:-4.1427});
 const [candidate,setCandidate]=useState<Stop|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[nearby,setNearby]=useState('');
 useEffect(()=>{const requestSequence=sequence;dialog.current?.showModal();return()=>{requestSequence.current++}},[]);
 async function resolve(point:Point,gps=false){
  const current=++sequence.current;setTarget(point);setCandidate(null);setNearby('');setBusy(true);setError('');
  try{const response=await fetch('/api/address/current?'+new URLSearchParams({latitude:String(point.latitude),longitude:String(point.longitude),nearby:gps?'1':'0'}),{cache:'no-store'});const data=await response.json() as {item?:{fullAddress?:unknown;address?:string};match?:{kind:string;name:string};error?:string};if(!response.ok)throw Error(data.error||'Unable to find an address here.');const source=data.item?.fullAddress&&typeof data.item.fullAddress==='object'?data.item.fullAddress as Record<string,unknown>:{};const stop=ebookerAddressSchema.parse({...source,text:source.text||data.item?.address,...(!gps?{coordinate:point}:{})});if(current!==sequence.current)return;setCandidate(stop);if(gps&&data.match?.kind==='place')setNearby(data.match.name);
  }catch(reason){if(current===sequence.current)setError(reason instanceof Error?reason.message:'Choose another point or search for an address.')}finally{if(current===sequence.current)setBusy(false)}
 }
 function locate(){if(!navigator.geolocation){setError('Location is unavailable. Choose a point on the map.');return}const current=++sequence.current;setBusy(true);setCandidate(null);setError('');navigator.geolocation.getCurrentPosition(position=>{if(current===sequence.current)void resolve({latitude:position.coords.latitude,longitude:position.coords.longitude},true)},()=>{if(current===sequence.current){setBusy(false);setError('Location permission is unavailable. Choose a point on the map.')}},{enableHighAccuracy:true,timeout:12000,maximumAge:30000})}
 return <dialog ref={dialog} className="eb-calendar eb-location" aria-labelledby="eb-location-title" onCancel={event=>{event.preventDefault();onClose()}}><h2 id="eb-location-title">Choose {label.toLowerCase()}</h2><p>Tap or move the map, or find a nearby place using your location.</p><div className="eb-location-map"><CustomerLiveMap pickup={null} picker cameraTarget={target} onPickerStart={()=>{sequence.current++;setCandidate(null);setBusy(false)}} onPickerMove={point=>void resolve(point)}/></div><button type="button" className="eb-button eb-outline" disabled={busy} onClick={locate}><LocateFixed size={18}/>Use current location</button><p className="eb-location-address" role="status"><MapPin size={17}/>{busy?'Checking address…':candidate?candidate.text:'Choose a point to confirm its address.'}</p>{nearby&&<p className="eb-nearby">Nearby place: {nearby}. Please confirm this is your pickup.</p>}{error&&<p className="eb-error" role="alert">{error}</p>}<footer><button type="button" className="eb-button eb-outline" onClick={onClose}>Cancel</button><button type="button" className="eb-button eb-black" disabled={!candidate||busy} onClick={()=>{if(candidate)onApply(candidate)}}>Use this location</button></footer></dialog>;
}
