export const journeyMilestones=['booking.confirmed','driver.assigned','driver.arrived','journey.started','journey.completed','booking.cancelled'] as const;
export type JourneyMilestone=typeof journeyMilestones[number];
export type JourneyBooking={externalId:string;normalCustomerId?:string|null;status:string;telephoneNumber:string|null;bookedAtTime:Date|string|null;acceptedAt:Date|string|null;arrivedAt:Date|string|null;pickedUpAt:Date|string|null;completedAt:Date|string|null;cancelledAt:Date|string|null;driverId:string|null;vehicleId:string|null;driverForename?:string|null;vehicleRegistration?:string|null;pickupDueTime?:Date|string|null};
export function normalizeJourneyPhone(value:string){const v=value.replace(/[ ()-]/g,'');if(/^\+[1-9]\d{7,14}$/.test(v))return v;if(/^07\d{9}$/.test(v))return '+44'+v.slice(1);throw Error('INVALID_RECIPIENT');}
export function journeyEvidence(b:JourneyBooking,milestone:string,now=Date.now()){
 const times:Record<string,Date|string|null>={'booking.confirmed':b.bookedAtTime,'driver.assigned':b.acceptedAt,'driver.arrived':b.arrivedAt,'journey.started':b.pickedUpAt,'journey.completed':b.completedAt,'booking.cancelled':b.cancelledAt};
 const raw=times[milestone],at=raw?new Date(raw).getTime():NaN;if(!Number.isFinite(at)||at>now+30000)return null;
 const status=b.status.toUpperCase().replace(/[^A-Z]/g,'');
 const cancelled=!!b.cancelledAt||['CANCELLED','CANCELED','REJECTED','NOFARE','NOSHOW'].includes(status),completed=!!b.completedAt||status==='COMPLETED';
 if(milestone==='booking.cancelled'&&!b.cancelledAt)return null;
 if(milestone==='journey.completed'&&(!b.completedAt||cancelled))return null;
 if(!['journey.completed','booking.cancelled'].includes(milestone)&&(cancelled||completed))return null;
 if(milestone==='booking.confirmed'&&(b.acceptedAt||b.arrivedAt||b.pickedUpAt))return null;
 if(milestone==='driver.assigned'&&(!b.driverId||!b.vehicleId||b.arrivedAt||b.pickedUpAt))return null;
 if(milestone==='driver.arrived'&&(!b.driverId||b.pickedUpAt))return null;
 if(milestone==='journey.started'&&!b.pickedUpAt)return null;
 if(!journeyMilestones.includes(milestone as JourneyMilestone))return null;
 return {revision:milestone==='booking.confirmed'?1:at,occurredAt:at,expiresAt:at+15*60000};
}
export const journeyParameterKeys=['booking_id','driver_name','vehicle_registration','pickup_time'] as const;
export function journeyParameters(b:JourneyBooking,keys:string[]){
 const values:Record<string,string>={booking_id:b.externalId,driver_name:b.driverForename||'',vehicle_registration:b.vehicleRegistration||'',pickup_time:b.pickupDueTime?new Date(b.pickupDueTime).toISOString():''};
 return keys.map(k=>{const value=values[k];if(!journeyParameterKeys.includes(k as typeof journeyParameterKeys[number])||!value||value.length>1024||/[\x00-\x1f]/.test(value))throw Error('PARAMETERS_UNAVAILABLE');return value;});
}
