import {firstPrebookTime,isPrebookInterval} from './prebook-time.js';
export const MAX_PICKUP_DAYS=90;
export function londonFields(at:number){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`}}
export function defaultPickupFields(minimum:number,now=Date.now()){return londonFields(firstPrebookTime(minimum,now))}
export function londonPickupIso(date:string,time:string,minimum:number,now=Date.now()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw new Error('Choose a date and pick-up time.');
 const naive=Date.parse(`${date}T${time}:00Z`);
 // UK local times have GMT and BST candidates. Validate by round-trip, including DST gaps.
 const candidates=[naive-3600000,naive].filter(at=>Number.isFinite(at)&&londonFields(at).date===date&&londonFields(at).time===time&&at>=now+minimum*60000&&at<=now+MAX_PICKUP_DAYS*86400000&&isPrebookInterval(at));
 if(!candidates.length)throw new Error(`Choose a valid UK time at least ${minimum} minutes ahead, within ${MAX_PICKUP_DAYS} days, in 5-minute intervals.`);
 return new Date(Math.min(...candidates)).toISOString();
}
