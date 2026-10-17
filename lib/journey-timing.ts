import type {RoadPoint} from './customer-road-route';
export type NearbyCar=RoadPoint&{id:string;recordedAt:string};
export type JourneyTiming={pickupMinutes:number|null;pickupTime:string|null;arrivalTime:string|null;tripMinutes:number|null};
export const emptyJourneyTiming:JourneyTiming={pickupMinutes:null,pickupTime:null,arrivalTime:null,tripMinutes:null};
const clock=(at:number)=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(at);
function distance(a:RoadPoint,b:RoadPoint){const rad=Math.PI/180,dlat=(a.latitude-b.latitude)*rad,dlng=(a.longitude-b.longitude)*rad;return Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlng/2)**2}
export function nearbyCars(cars:NearbyCar[],pickup:RoadPoint,now:number){
 return cars.filter(car=>Number.isFinite(car.latitude)&&Math.abs(car.latitude)<=90&&Number.isFinite(car.longitude)&&Math.abs(car.longitude)<=180&&Number.isFinite(Date.parse(car.recordedAt))&&now-Date.parse(car.recordedAt)<=120000&&Date.parse(car.recordedAt)<=now+30000)
  .sort((a,b)=>distance(a,pickup)-distance(b,pickup)).slice(0,3);
}
export function journeyTiming(input:{pickupSeconds:number|null;sampledAt:number;tripSeconds:number|null;scheduledAt?:string|null;now:number}):JourneyTiming{
 const tripMinutes=input.tripSeconds!==null&&Number.isFinite(input.tripSeconds)&&input.tripSeconds>=0?Math.max(1,Math.ceil(input.tripSeconds/60)):null;
 const scheduled=input.scheduledAt?Date.parse(input.scheduledAt):NaN;
 if(Number.isFinite(scheduled)&&scheduled>=input.now)return {pickupMinutes:null,pickupTime:clock(scheduled),arrivalTime:tripMinutes===null?null:clock(scheduled+tripMinutes*60000),tripMinutes};
 const fresh=input.now-input.sampledAt<=90000&&input.now>=input.sampledAt;
 const pickupMinutes=fresh&&input.pickupSeconds!==null&&Number.isFinite(input.pickupSeconds)&&input.pickupSeconds>=0?Math.max(1,Math.ceil(input.pickupSeconds/60)):null;
 return {pickupMinutes,pickupTime:null,tripMinutes,arrivalTime:pickupMinutes===null||tripMinutes===null?null:clock(input.now+(pickupMinutes+tripMinutes)*60000)};
}
