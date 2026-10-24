'use client';
import {UserRound,X} from 'lucide-react';
import {distanceLabel,type DriverRoute} from '@/lib/driver-navigation';
import type {DriverServiceType} from '@/lib/driver-service-types';
type Offer={pickup:{label:string};destination:{label:string};fare_pence:number;service_type?:DriverServiceType;training:boolean;created_at?:string;expires_at:string};
type Props={job:Offer;route:DriverRoute|null;remaining:number;busy:boolean;preview:boolean;onAccept:()=>void;onDecline:()=>void;onRestart:()=>void};
export default function OfferCard({job,route,remaining,busy,preview,onAccept,onDecline,onRestart}:Props){
 const total=job.created_at?Math.max(1,(Date.parse(job.expires_at)-Date.parse(job.created_at))/1000):60;
 const percentage=Math.min(100,Math.max(0,remaining/total*100));
 function estimate(seconds:number|undefined,metres:number|undefined){return seconds===undefined||metres===undefined?'Calculating route…':`${Math.max(1,Math.ceil(seconds/60))} min (${distanceLabel(metres)})`}
 return <div className="driver-offer-card" aria-label="Job offer">
  <header className="driver-offer-top"><span className="driver-offer-service"><UserRound size={19}/>{job.service_type??'ASAP'}</span><button className="driver-offer-close" aria-label="Decline offer" disabled={busy} onClick={onDecline}><X size={25}/></button></header>
  <div className="driver-offer-price">{new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(job.fare_pence/100)}</div>
  <p className="driver-offer-caption">{job.training?'Training request · Example fixed fare':'Fixed fare'}</p>
  <div className="driver-offer-itinerary">
   <div className="driver-offer-stop" aria-label="Pickup"><span className="driver-offer-stop-pin" aria-hidden="true">●</span><div><strong>{estimate(route?.pickupDuration,route?.pickupDistance)}</strong><p>{job.pickup.label}</p></div></div>
   <div className="driver-offer-stop" aria-label="Destination"><span className="driver-offer-stop-pin destination" aria-hidden="true">■</span><div><strong>{estimate(route?.tripDuration,route?.tripDistance)}</strong><p>{job.destination.label}</p></div></div>
  </div>
  <button className="driver-offer-accept" disabled={busy||remaining===0} onClick={onAccept} aria-label={remaining===0?'Offer expired':'Accept job'}><span className="driver-offer-time-fill" aria-hidden="true" style={{width:`${percentage}%`}}/><strong>{busy?'Accepting…':remaining===0?'Offer expired':'Accept job'}</strong><span className="driver-offer-seconds" aria-label={`${remaining} seconds remaining`}>{remaining}s</span></button>
  {preview&&remaining===0&&<button className="driver-text-button" onClick={onRestart}>Restart preview offer</button>}
 </div>;
}
