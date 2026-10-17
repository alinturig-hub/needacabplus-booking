'use client';
import {useEffect,useRef,useState} from 'react';
import {customerRoadRouteDetails,type RoadPoint} from '@/lib/customer-road-route';
import {journeyTiming,nearbyCars,type NearbyCar} from '@/lib/journey-timing';
export function useJourneyTiming({pickup,vehicles,tripSeconds,enabled,scheduled=false,scheduledAt}:{pickup:RoadPoint|null;vehicles:NearbyCar[];tripSeconds:number|null;enabled:boolean;scheduled?:boolean;scheduledAt?:string|null}){
 const cars=useRef(vehicles);
 useEffect(()=>{cars.current=vehicles},[vehicles]);
 const [sample,setSample]=useState<{seconds:number|null;at:number;latitude?:number;longitude?:number}>({seconds:null,at:0}),[now,setNow]=useState(Date.now);
 const latitude=pickup?.latitude,longitude=pickup?.longitude,hasCars=vehicles.length>0;
 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);
 },[]);
 useEffect(()=>{
  if(!enabled||scheduled||latitude===undefined||longitude===undefined)return;
  let active=true,controller:AbortController|null=null;
  async function refresh(){
   controller?.abort();controller=new AbortController();const signal=controller.signal;
   const candidates=nearbyCars(cars.current,{latitude:latitude!,longitude:longitude!},Date.now());
   const timeout=setTimeout(()=>controller?.abort(),10000);
   const routes=await Promise.allSettled(candidates.map(car=>customerRoadRouteDetails([car,{latitude:latitude!,longitude:longitude!}],signal)));
   clearTimeout(timeout);if(!active||signal.aborted)return;
   const durations=routes.flatMap(route=>route.status==='fulfilled'&&route.value.durationSeconds>=0?[route.value.durationSeconds]:[]);
   setSample({seconds:durations.length?Math.min(...durations):null,at:Date.now(),latitude,longitude});setNow(Date.now());
  }
  void refresh();const timer=setInterval(()=>void refresh(),30000);
  return()=>{active=false;controller?.abort();clearInterval(timer)};
 },[latitude,longitude,enabled,hasCars,scheduled]);
 // A moved pickup never reuses a sample from the previous location.
 const matches=sample.latitude===latitude&&sample.longitude===longitude;
 const timing=journeyTiming({pickupSeconds:enabled&&hasCars&&matches?sample.seconds:null,sampledAt:sample.at,tripSeconds,scheduledAt,now});
 return scheduled&&!scheduledAt?{...timing,pickupMinutes:null,pickupTime:null,arrivalTime:null}:timing;
}
