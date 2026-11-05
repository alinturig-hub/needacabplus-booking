/** A single in-flight browser request shared across login and guest navigation.
 * Coordinates stay in memory; only a denied/failed outcome is session-scoped. */
export type BrowserPoint={latitude:number;longitude:number};
let pending:Promise<BrowserPoint|null>|null=null;
let recent:{point:BrowserPoint;at:number}|null=null;
const outcomeKey='nac-initial-location-outcome';
function outcome(){try{return sessionStorage.getItem(outcomeKey)}catch{return null}}
function remember(value:string){try{sessionStorage.setItem(outcomeKey,value)}catch{/* Storage can be unavailable in private browsers. */}}
export function requestInitialLocation():Promise<BrowserPoint|null>{
 if(typeof navigator==='undefined'||!navigator.geolocation)return Promise.resolve(null);
 if(recent&&Date.now()-recent.at<120000)return Promise.resolve(recent.point);
 if(pending)return pending;
 if(['denied','failed'].includes(outcome()||''))return Promise.resolve(null);
 pending=new Promise<BrowserPoint|null>(resolve=>{
  try {
  navigator.geolocation.getCurrentPosition(({coords})=>{
   const point={latitude:coords.latitude,longitude:coords.longitude};
   if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180){remember('failed');resolve(null);return}
   recent={point,at:Date.now()};remember('granted');resolve(point);
  },error=>{remember(error.code===1?'denied':'failed');resolve(null)},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  } catch {remember('failed');resolve(null)}
 }).finally(()=>{pending=null});
 return pending;
}
