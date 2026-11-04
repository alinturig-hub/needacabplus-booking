'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {LocateFixed,MapPin} from 'lucide-react';
import CustomerLiveMap from './customer-live-map';
import {ebookerAddressSchema,type EbookerInput} from '@/lib/ebooker-policy';
type Stop=NonNullable<EbookerInput['pickup']>;
type Point={latitude:number;longitude:number};
export default function EbookerLocation({label,value,onClose,onApply,initialLocate=false}:{label:string;value:Stop|null;onClose:()=>void;onApply:(stop:Stop)=>void;initialLocate?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),sequence=useRef(0);
 const [target,setTarget]=useState<Point>(value?.coordinate||{latitude:50.3755,longitude:-4.1427});
 const [candidate,setCandidate]=useState<Stop|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[nearby,setNearby]=useState('');
 const resolve=useCallback(async(point:Point,gps=false)=>{
  const current=++sequence.current;setTarget(point);setCandidate(null);setNearby('');setBusy(true);setError('');
  try{const response=await fetch('/api/address/current?'+new URLSearchParams({latitude:String(point.latitude),longitude:String(point.longitude),nearby:gps?'1':'0'}),{cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await response.json() as {item?:{fullAddress?:unknown;address?:string};match?:{kind:string;name:string};error?:string};if(!response.ok)throw Error(data.error||'Unable to find an address here.');const source=data.item?.fullAddress&&typeof data.item.fullAddress==='object'?data.item.fullAddress as Record<string,unknown>:{};const stop=ebookerAddressSchema.parse({...source,text:source.text||data.item?.address,...(!gps?{coordinate:point}:{})});if(current!==sequence.current)return;setCandidate(stop);if(gps&&data.match?.kind==='place')setNearby(data.match.name);
  }catch(reason){if(current===sequence.current)setError(reason instanceof DOMException&&reason.name==='TimeoutError'?'Your GPS position was found, but the address lookup timed out. Try again or enter an address manually.':reason instanceof Error?reason.message:'Choose another point or search for an address.')}finally{if(current===sequence.current)setBusy(false)}
 },[]);
 const locate=useCallback(()=>{
  if(!window.isSecureContext){setError('GPS needs a secure connection. Open this page using HTTPS.');return}
  if(!navigator.geolocation){setError('GPS is not supported by this browser. Search for an address or choose a point on the map.');return}
  const current=++sequence.current;setBusy(true);setCandidate(null);setNearby('');setError('');
  const success=(position:GeolocationPosition)=>{if(current===sequence.current)void resolve({latitude:position.coords.latitude,longitude:position.coords.longitude},true)};
  const failure=(reason:GeolocationPositionError)=>{if(current!==sequence.current)return;setBusy(false);setError(reason.code===1?'Location access is blocked. Allow Location in this site’s browser settings, then tap Use current location again. You can also enter an address manually.':reason.code===3?'GPS timed out. Move near a window or outdoors and try again, or enter an address manually.':'Your device could not determine its location. Check that Location Services are enabled, or enter an address manually.')};
  navigator.geolocation.getCurrentPosition(success,reason=>{if(current!==sequence.current)return;if(reason.code===1){failure(reason);return}navigator.geolocation.getCurrentPosition(success,failure,{enableHighAccuracy:false,timeout:10000,maximumAge:60000})},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
 },[resolve]);
 useEffect(()=>{const requestSequence=sequence;dialog.current?.showModal();const frame=requestAnimationFrame(()=>{if(initialLocate)locate()});return()=>{cancelAnimationFrame(frame);requestSequence.current++}},[initialLocate,locate]);

 return <dialog ref={dialog} className="eb-calendar eb-location" aria-labelledby="eb-location-title" onCancel={event=>{event.preventDefault();onClose()}}><h2 id="eb-location-title">Choose {label.toLowerCase()}</h2><p>Tap or move the map, or find a nearby place using your location.</p><div className="eb-location-map"><CustomerLiveMap pickup={null} picker cameraTarget={target} onPickerStart={()=>{sequence.current++;setCandidate(null);setBusy(false)}} onPickerMove={point=>void resolve(point)}/></div><button type="button" className="eb-button eb-outline" disabled={busy} onClick={locate}><LocateFixed size={18}/>Use current location</button><p className="eb-location-address" role="status"><MapPin size={17}/>{busy?'Finding your location and checking the address…':candidate?candidate.text:'Choose a point to confirm its address.'}</p>{nearby&&<p className="eb-nearby">Nearby place: {nearby}. Please confirm this is your pickup.</p>}{error&&<p className="eb-error" role="alert">{error}</p>}<footer><button type="button" className="eb-button eb-outline" onClick={onClose}>Cancel</button><button type="button" className="eb-button eb-black" disabled={!candidate||busy} onClick={()=>{if(candidate)onApply(candidate)}}>Use this location</button></footer></dialog>;
}
