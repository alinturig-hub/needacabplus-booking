/** Shared pickup milestone policy for Alexa and future customer-app delivery.
 * Requires a provider pickup ETA, not pickup due time or journey duration.
 */
export function pickupUpdateStage(row:{status:string;driverId:string|null;vehicleId:string|null;updatedAt:Date|string;estimatedPickupAt?:string|null},now=Date.now()){
 const state=row.status.toUpperCase().replace(/[^A-Z]/g,''),age=now-new Date(row.updatedAt).getTime();
 if(!['ACCEPTED','ARRIVED'].includes(state)||!row.driverId||!row.vehicleId||!Number.isFinite(age)||age< -10000||age>180000)return null;
 if(state==='ARRIVED')return 'outside';
 const eta=row.estimatedPickupAt?Date.parse(row.estimatedPickupAt)-now:NaN;
 return age<=90000&&Number.isFinite(eta)&&eta>0&&eta<=120000?'two_minutes':'dispatched';
}
