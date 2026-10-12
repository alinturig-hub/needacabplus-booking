import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';

type VehicleRow={id:string;external_id:string;callsign:string|null;registration:string|null;plate_number:string|null;status:string|null;booking_id:number|null;latitude:string|number;longitude:string|number;recorded_at:Date|string;driver_external_id:string|null;driver_callsign:string|null;forename:string|null;surname:string|null};
type BookingRow={external_id:string;status:string;pickup:string|null;destination:string|null};
type RevenueRow={driver_id:string;status:string;completed_at:Date|string|null;no_fare_at:Date|string|null;arrived_at:Date|string|null;price:string|number|null;cost:string|number|null;account_id:string|null;waiting_chargeable:boolean|null;waiting_rate:string|number|null};

export type FleetMapVehicle={id:string;driverId:string|null;callsign:string|null;name:string|null;latitude:number;longitude:number;vehicleStatus:string;operationalStatus:'CLEAR'|'DOW'|'DAP'|'POB';recordedAt:string;isLive:boolean;registration:string|null;bookingId:number|null;pickupAddress:string|null;destinationAddress:string|null;todayRevenue:number|null};

const cache=globalThis as typeof globalThis&{taxiCrmFleetRevenueCache?:{expires:number;day:string;byDriver:Map<string,number>;available:boolean}};
const money=(value:unknown)=>{const number=Number(value);return value===null||value===undefined||!Number.isFinite(number)?0:number};
const round=(value:number)=>Number(value.toFixed(2));
const londonDay=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

function operationalStatus(vehicleStatus:string|null,bookingStatus:string|undefined):FleetMapVehicle['operationalStatus']{
 if(bookingStatus==='POB')return 'POB';
 if(bookingStatus==='ARRIVED')return 'DAP';
 if(['BusyMeterOnFromClear','BusyMeterOnFromMeterOffCash','BusyMeterOnFromMeterOffAccount'].includes(vehicleStatus||''))return 'POB';
 if(['BusyMeterOff','BusyMeterOffAccount'].includes(vehicleStatus||''))return 'DOW';
 return 'CLEAR';
}

function bookingRevenue(row:RevenueRow){
 const base=money(row.price)>0?money(row.price):money(row.cost);
 if(row.completed_at||row.status==='COMPLETED')return round(base);
 if(!(row.no_fare_at||row.status==='NO_FARE')||!row.account_id?.trim())return 0;
 let waiting=0;
 if(row.waiting_chargeable&&row.arrived_at&&row.no_fare_at){
  const minutes=(new Date(row.no_fare_at).getTime()-new Date(row.arrived_at).getTime())/60000;
  if(minutes>0)waiting=round(minutes*money(row.waiting_rate));
 }
 return round(base+waiting);
}

export async function taxiCrmFleetMapVehicles():Promise<FleetMapVehicle[]>{
 return withTaxiCrmReadOnly(async client=>{
  const vehicles=(await client.query<VehicleRow>(`SELECT vehicle.id,vehicle."externalId" external_id,vehicle.callsign,vehicle.registration,vehicle."plateNumber" plate_number,
    vehicle."currentStatus" status,vehicle."currentBookingId" booking_id,vehicle."currentLatitude" latitude,vehicle."currentLongitude" longitude,vehicle."lastSeenAt" recorded_at,
    driver."externalId" driver_external_id,driver.callsign driver_callsign,driver.forename,driver.surname
    FROM public."Vehicle" vehicle LEFT JOIN public."Driver" driver ON driver.id=vehicle."currentDriverId"
    WHERE vehicle."currentLatitude" IS NOT NULL AND vehicle."currentLongitude" IS NOT NULL AND vehicle."lastSeenAt" IS NOT NULL
      AND vehicle."currentStatus" IS DISTINCT FROM 'NotWorking'
    ORDER BY vehicle."lastSeenAt" DESC,vehicle.callsign ASC LIMIT 1000`)).rows;
  const bookingIds=[...new Set(vehicles.map(vehicle=>vehicle.booking_id).filter((id):id is number=>id!==null&&id>0).map(String))];
  const currentBookings=bookingIds.length?(await client.query<BookingRow>(`SELECT booking."externalId" external_id,booking.status,
    max(location.address) FILTER(WHERE location.type='PICKUP') pickup,
    max(location.address) FILTER(WHERE location.type='DESTINATION') destination
    FROM public."Booking" booking LEFT JOIN public."BookingLocation" location ON location."bookingId"=booking.id
    WHERE booking.provider='AUTOCAB' AND booking."externalId"=ANY($1::text[])
    GROUP BY booking.id`,[bookingIds])).rows:[];
  const bookings=new Map(currentBookings.map(booking=>[booking.external_id,booking]));

  const today=londonDay();
  let revenue=cache.taxiCrmFleetRevenueCache;
  if(!revenue||revenue.expires<Date.now()||revenue.day!==today){
   const driverIds=[...new Set(vehicles.map(vehicle=>vehicle.driver_external_id).filter((id):id is string=>Boolean(id)))];
   const byDriver=new Map<string,number>();
   let available=true;
   try{if(driverIds.length){
    const rows=(await client.query<RevenueRow>(`WITH bounds AS (
      SELECT ((now() AT TIME ZONE 'Europe/London')::date AT TIME ZONE 'Europe/London') day_start,
             (((now() AT TIME ZONE 'Europe/London')::date+1) AT TIME ZONE 'Europe/London') day_end
     ) SELECT booking."driverId" driver_id,booking.status,booking."completedAt" completed_at,booking."noFareAt" no_fare_at,
       booking."arrivedAt" arrived_at,booking.price,booking.cost,booking."accountId" account_id,
       rule."waitingChargeable" waiting_chargeable,rule."waitingRatePerMinute" waiting_rate
     FROM public."Booking" booking CROSS JOIN bounds
     LEFT JOIN public."AccountRevenueRule" rule ON rule.provider=booking.provider AND rule."accountId"=booking."accountId"
     WHERE booking."driverId"=ANY($1::text[]) AND (
       (booking."completedAt">=bounds.day_start AND booking."completedAt"<bounds.day_end) OR
       (booking."noFareAt">=bounds.day_start AND booking."noFareAt"<bounds.day_end AND booking."accountId" IS NOT NULL AND booking."accountCode" IS NOT NULL)
     )`,[driverIds])).rows;
    for(const row of rows)byDriver.set(row.driver_id,round((byDriver.get(row.driver_id)||0)+bookingRevenue(row)));
   }}catch(error){
    available=false;
    console.error('TaxiCRM fleet revenue unavailable',error instanceof Error?error.name:'Unknown error');
   }
   revenue={day:today,expires:Date.now()+60_000,byDriver,available};
   cache.taxiCrmFleetRevenueCache=revenue;
  }

  const now=Date.now();
  return vehicles.flatMap(vehicle=>{
   const latitude=Number(vehicle.latitude),longitude=Number(vehicle.longitude);
   if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<-90||latitude>90||longitude<-180||longitude>180)return [];
   const recordedAt=new Date(vehicle.recorded_at).toISOString();
   const booking=vehicle.booking_id?bookings.get(String(vehicle.booking_id)):undefined;
   const ageSeconds=Math.max(0,Math.floor((now-new Date(recordedAt).getTime())/1000));
   return [{id:vehicle.id,driverId:vehicle.driver_external_id,callsign:vehicle.driver_callsign||vehicle.callsign,
    name:[vehicle.forename,vehicle.surname].filter(Boolean).join(' ')||null,latitude,longitude,
    vehicleStatus:vehicle.status||'Unknown',operationalStatus:operationalStatus(vehicle.status,booking?.status),recordedAt,isLive:ageSeconds<=120,
    registration:vehicle.registration||vehicle.plate_number||vehicle.callsign||vehicle.external_id,
    bookingId:vehicle.booking_id&&vehicle.booking_id>0?vehicle.booking_id:null,pickupAddress:booking?.pickup||null,destinationAddress:booking?.destination||null,
    todayRevenue:vehicle.driver_external_id&&revenue.available?(revenue.byDriver.get(vehicle.driver_external_id)||0):null}];
  });
 });
}
