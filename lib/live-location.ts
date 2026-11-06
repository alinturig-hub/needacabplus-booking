import type {BrowserPoint} from './browser-location';
/** Foreground-only tracking. No background permission, storage or reverse-geocoding. */
export function watchForegroundLocation(onLocation:(point:BrowserPoint|null)=>void){
 if(typeof navigator==='undefined'||!navigator.geolocation)return()=>{};
 let watch:number|null=null,disposed=false,generation=0;
 const stop=()=>{generation++;if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null}};
 const start=()=>{stop();if(disposed||document.visibilityState==='hidden')return;const current=generation;
  try{watch=navigator.geolocation.watchPosition(({coords})=>{
   if(disposed||current!==generation)return;
   const {latitude,longitude}=coords;
   onLocation(Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{latitude,longitude}:null);
  },()=>{if(!disposed&&current===generation)onLocation(null)},{enableHighAccuracy:true,maximumAge:0,timeout:12000})}catch{onLocation(null)}
 };
 const visibility=()=>{if(document.visibilityState==='hidden'){stop();onLocation(null)}else start()};
 document.addEventListener('visibilitychange',visibility);start();
 return()=>{disposed=true;stop();document.removeEventListener('visibilitychange',visibility)};
}
