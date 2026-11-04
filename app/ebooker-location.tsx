'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {LocateFixed,MapPin,Check,Pencil,X} from 'lucide-react';
import CustomerLiveMap from './customer-live-map';
import {ebookerAddressSchema,type EbookerInput} from '@/lib/ebooker-policy';
type Stop=NonNullable<EbookerInput['pickup']>;
type Point={latitude:number;longitude:number};
export default function EbookerLocation({label,value,onClose,onApply,onManual,initialLocate=false}:{label:string;value:Stop|null;onClose:()=>void;onApply:(stop:Stop)=>void;onManual?:()=>void;initialLocate?:boolean}){
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

 if(initialLocate)return <dialog ref={dialog} className="eb-calendar eb-location eb-pickup-confirm" aria-labelledby="eb-location-title" onCancel={event=>{event.preventDefault();onClose()}}>
  <button type="button" className="eb-pickup-close" aria-label="Cancel" onClick={onClose}><X size={18}/></button>
  <div className="eb-pickup-heading"><span className="eb-pickup-icon"><MapPin size={25}/></span><div><span className="eb-pickup-eyebrow">Nearest place</span><h2 id="eb-location-title">Is this your pick-up?</h2></div></div>
  <div className="eb-pickup-confirm-address" role="status">{busy?'Finding your GPS position…':candidate?candidate.text:'Your pickup address will appear here.'}</div>
  {candidate&&<p className="eb-pickup-verified">GPS location verified for booking</p>}{nearby&&<p className="eb-nearby">Nearby place: {nearby}.</p>}
  {error&&<p className="eb-error" role="alert">{error}</p>}{!busy&&!candidate&&<button type="button" className="eb-map-link" onClick={locate}><LocateFixed size={15}/>Try GPS again</button>}
  <footer><button type="button" className="eb-button eb-black" disabled={!candidate||busy} onClick={()=>{if(candidate)onApply(candidate)}}><Check size={17}/>Confirm pick-up</button><button type="button" className="eb-button eb-outline" onClick={onManual||onClose}><Pencil size={16}/>Enter address</button></footer>
 </dialog>;

 return <dialog ref={dialog} className="eb-calendar eb-location" aria-labelledby="eb-location-title" onCancel={event=>{event.preventDefault();onClose()}}><h2 id="eb-location-title">Choose {label.toLowerCase()}</h2><p>Tap or move the map, or find a nearby place using your location.</p><div className="eb-location-map"><CustomerLiveMap pickup={null} picker cameraTarget={target} onPickerStart={()=>{sequence.current++;setCandidate(null);setBusy(false)}} onPickerMove={point=>void resolve(point)}/></div><button type="button" className="eb-button eb-outline" disabled={busy} onClick={locate}><LocateFixed size={18}/>Use current location</button><p className="eb-location-address" role="status"><MapPin size={17}/>{busy?'Finding your location and checking the address…':candidate?candidate.text:'Choose a point to confirm its address.'}</p>{nearby&&<p className="eb-nearby">Nearby place: {nearby}. Please confirm this is your pickup.</p>}{error&&<p className="eb-error" role="alert">{error}</p>}<footer><button type="button" className="eb-button eb-outline" onClick={onClose}>Cancel</button><button type="button" className="eb-button eb-black" disabled={!candidate||busy} onClick={()=>{if(candidate)onApply(candidate)}}>Use this location</button></footer></dialog>;
}
