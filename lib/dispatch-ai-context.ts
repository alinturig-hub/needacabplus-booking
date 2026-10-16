import {database} from './database';
import {fleetMapVehicles} from './live-drivers';
import {taxiCrmDispatchReadEnabled,taxiCrmLiveReadEnabled} from './taxicrm-database';
import {taxiCrmDispatchLive} from './taxicrm-dispatch';
import type {FleetMapVehicle} from './taxicrm-fleet-map';

export type DispatchAiJob={id:string;reference:string;pickup:string;destination:string;pickup_zone:string|null;status:string;due_at:string|null;vehicle:string|null;assigned:boolean};
type JobFeed={jobs:DispatchAiJob[];activeTotal:number;serverTime:string;source:'taxicrm'|'local'};

async function liveJobs():Promise<JobFeed>{
 if(taxiCrmDispatchReadEnabled()){
  const data=await taxiCrmDispatchLive();
  return {jobs:data.jobs,activeTotal:data.activeTotal,serverTime:data.serverTime,source:'taxicrm'};
 }
 const result=await database().query<DispatchAiJob&{active_total:string}>(`SELECT id::text,COALESCE(external_booking_id,id::text) AS reference,pickup,destination,
  COALESCE(NULLIF(pickup_data->>'zoneName',''),NULLIF(pickup_data->>'zone','')) AS pickup_zone,
  status,COALESCE(timeline_data->>'scheduledAt',pickup_data->>'dueTime') AS due_at,
  COALESCE(vehicle_data->>'callsign',vehicle_data->>'id',vehicle_data->>'vehicleId') AS vehicle,
  COALESCE(driver_data->>'id',driver_data->>'driverId','')<>'' OR COALESCE(vehicle_data->>'id',vehicle_data->>'vehicleId','')<>'' AS assigned,
  count(*) OVER()::text AS active_total
  FROM bookings WHERE external_booking_id IS NOT NULL AND COALESCE(pricing_data->>'testBooking','false')<>'true'
  AND status NOT IN ('Completed','Cancelled','No Fare') ORDER BY updated_at DESC LIMIT 100`);
 return {jobs:result.rows,activeTotal:Number(result.rows[0]?.active_total||0),serverTime:new Date().toISOString(),source:'local'};
}

function clean(value:unknown,max=140){return String(value??'').slice(0,max)}
function dueSort(job:DispatchAiJob){const timestamp=job.due_at?Date.parse(job.due_at):NaN;return Number.isFinite(timestamp)?timestamp:Number.POSITIVE_INFINITY}
const waiting=(job:DispatchAiJob)=>!job.assigned&&['Booked','Created','Modified','Running Late'].includes(job.status);
function currentVehicle(vehicle:FleetMapVehicle,now:number){return vehicle.isLive&&Number.isFinite(Date.parse(vehicle.recordedAt))&&now-Date.parse(vehicle.recordedAt)<=120_000&&Date.parse(vehicle.recordedAt)<=now+30_000}

export function dispatchAiSummary(feed:JobFeed|undefined,vehicles:FleetMapVehicle[]|undefined,question:string,focus:{bookingId?:string;driverId?:string},now=Date.now()){
 const jobs=feed?.jobs||[],fleet=vehicles||[];
 const waitingJobs=jobs.filter(waiting);
 const live=fleet.filter(vehicle=>currentVehicle(vehicle,now));
 const clear=live.filter(vehicle=>vehicle.operationalStatus==='CLEAR');
 const dueSoon=waitingJobs.filter(job=>{const due=dueSort(job);return due<=now+15*60_000});
 const overdue=dueSoon.filter(job=>dueSort(job)<now);
 const selectedJob=jobs.find(job=>job.id===focus.bookingId||job.reference===focus.bookingId);
 const selectedDriver=fleet.find(vehicle=>vehicle.id===focus.driverId||vehicle.driverId===focus.driverId);
 const query=question.toLowerCase();
 const terms=query.match(/[a-z0-9]{4,}/g)?.filter(term=>!['what','which','where','when','booking','bookings','driver','drivers','vehicle','vehicles','status','clear','available','about','should','pentru','sofer','soferi','masina','masini','rezervare','rezervari'].includes(term))||[];
 const matchingJobs=jobs.filter(job=>job.reference.length>=4&&query.includes(job.reference.toLowerCase())||terms.some(term=>`${job.pickup} ${job.destination}`.toLowerCase().includes(term))).slice(0,8);
 const matchingDrivers=fleet.filter(vehicle=>[vehicle.callsign,vehicle.registration,vehicle.name].some(value=>value&&value.length>=3&&query.includes(value.toLowerCase()))).slice(0,8);
 const selectedJobs=[...new Map([selectedJob,...matchingJobs,...[...waitingJobs].sort((a,b)=>dueSort(a)-dueSort(b)).slice(0,15)].filter((item):item is DispatchAiJob=>Boolean(item)).map(item=>[item.id,item])).values()].slice(0,20);
 const selectedVehicles=[...new Map([selectedDriver,...matchingDrivers,...live.filter(vehicle=>vehicle.operationalStatus!=='CLEAR').slice(0,10),...clear.slice(0,10)].filter((item):item is FleetMapVehicle=>Boolean(item)).map(item=>[item.id,item])).values()].slice(0,25);
 const recommendations:string[]=[];
 if(overdue.length)recommendations.push(`${overdue.length} unassigned booking(s) are past pickup time. Check the earliest first and verify the current assignment/status before contacting a customer.`);
 if(dueSoon.length&&clear.length)recommendations.push(`${dueSoon.length} unassigned booking(s) are due within 15 minutes and ${clear.length} live vehicle(s) are clear. Review proximity and capability in the live map before deciding on dispatch.`);
 if(dueSoon.length&&!clear.length&&vehicles)recommendations.push(`${dueSoon.length} unassigned booking(s) are due within 15 minutes, with no currently live clear vehicle. Check fleet status and escalation options; do not assume an offline vehicle is available.`);
 if(!feed)recommendations.push('The booking feed is unavailable. Do not infer booking priority from old chat messages.');
 if(!vehicles)recommendations.push('The live vehicle feed is unavailable. Do not recommend a specific driver as available.');
 return {
  checkedAt:new Date(now).toISOString(),bookingSource:feed?.source||'unavailable',driverSource:vehicles?(taxiCrmLiveReadEnabled()?'taxicrm':'local'):'unavailable',
  bookingFeedAt:feed?.serverTime||null,bookings:{activeTotal:feed?.activeTotal??null,sampled:jobs.length,waiting:feed?waitingJobs.length:null,dueWithin15Minutes:feed?dueSoon.length:null,overdue:feed?overdue.length:null,records:selectedJobs.map(job=>({id:clean(job.id,80),reference:clean(job.reference,80),status:clean(job.status,50),pickup:clean(job.pickup),destination:clean(job.destination),pickupZone:clean(job.pickup_zone,80),dueAt:job.due_at,assigned:job.assigned,vehicle:clean(job.vehicle,80)})),truncated:Boolean(feed&&feed.activeTotal>jobs.length)},
  drivers:{tracked:vehicles?fleet.length:null,live:vehicles?live.length:null,clear:vehicles?clear.length:null,statusCounts:vehicles?Object.fromEntries([...new Set(live.map(vehicle=>vehicle.operationalStatus))].map(status=>[status,live.filter(vehicle=>vehicle.operationalStatus===status).length])):null,records:selectedVehicles.map(vehicle=>({id:clean(vehicle.id,80),driverId:clean(vehicle.driverId,80),callsign:clean(vehicle.callsign,80),name:clean(vehicle.name,100),registration:clean(vehicle.registration,80),status:clean(vehicle.vehicleStatus,80),operationalStatus:vehicle.operationalStatus,isLive:currentVehicle(vehicle,now),recordedAt:vehicle.recordedAt,bookingId:vehicle.bookingId})),truncated:Boolean(vehicles&&selectedVehicles.length<fleet.length)},
  recommendations,links:{dispatcher:'/dispatch',bookings:'/dispatch/bookings',map:'/dispatch/map'},
 };
}

export async function freshDispatchAiSummary(question:string,focus:{bookingId?:string;driverId?:string}){
 const [jobs,vehicles]=await Promise.allSettled([liveJobs(),fleetMapVehicles()]);
 if(jobs.status==='rejected'&&vehicles.status==='rejected')throw new Error('Live bookings and driver status are both unavailable.');
 return dispatchAiSummary(jobs.status==='fulfilled'?jobs.value:undefined,vehicles.status==='fulfilled'?vehicles.value:undefined,question,focus);
}
