import {sourceTimestamp,providerTimestamp} from './autocab/booking-detail-recovery.mjs';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const text=value=>typeof value==='string'&&value.trim()?value.trim():typeof value==='number'?String(value):null;
const field=(record,...keys)=>{for(const key of keys){const found=Object.entries(object(record)).find(([name])=>name.toLowerCase()===key.toLowerCase());const value=text(found?.[1]);if(value)return value}return null};
const assignedPayload=(snapshot,payload)=>{
 const row=object(payload);
 for(const key of ['id','callsign']){const saved=field(snapshot,key),incoming=field(row,key);if(saved&&incoming&&saved!==incoming)return {}}
 return row;
};
const fullName=record=>field(record,'fullName','name')||[field(record,'forename','firstName'),field(record,'surname','lastName')].filter(Boolean).join(' ')||null;
export function bookingAssignmentPresentation(row){
 const ds=object(row.driver_snapshot),dp=assignedPayload(ds,row.driver_payload),dr=object(row.driver_registry);
 const vs=object(row.vehicle_snapshot),vp=assignedPayload(vs,row.vehicle_payload),vr=object(row.vehicle_registry);
 const driverRegistryFields=[],vehicleRegistryFields=[];
 const fallback=(name,snapshot,payload,registry,fields)=>{const value=text(snapshot)||text(payload);if(value)return value;const stored=text(registry);if(stored)fields.push(name);return stored};
 const driver=field(ds,'id','callsign','name','forename','phone','badgeNumber')?{
  id:field(ds,'id'),callsign:field(ds,'callsign'),
  name:fallback('name',fullName(ds),fullName(dp),fullName(dr),driverRegistryFields),
  phone:fallback('phone',field(ds,'phone'),field(dp,'mobile','telephoneNumber','telephone','phone'),field(dr,'mobile','telephone'),driverRegistryFields),
  badgeNumber:fallback('badgeNumber',field(ds,'badgeNumber'),field(dp,'badgeNumber'),field(dr,'badgeNumber'),driverRegistryFields),
  eta:null,registryFields:driverRegistryFields,
 }:null;
 const vehicle=field(vs,'id','callsign','registration','make','model')?{
  id:field(vs,'id'),vehicleCallsign:field(vs,'callsign'),
  make:fallback('make',field(vs,'make'),field(vp,'make'),field(vr,'make'),vehicleRegistryFields),
  model:fallback('model',field(vs,'model'),field(vp,'model'),field(vr,'model'),vehicleRegistryFields),
  colour:fallback('colour',field(vs,'colour'),field(vp,'colour','color'),field(vr,'colour'),vehicleRegistryFields),
  registration:fallback('registration',field(vs,'registration'),field(vp,'registration'),field(vr,'registration'),vehicleRegistryFields),
  plateNumber:fallback('plateNumber',field(vs,'plateNumber'),field(vp,'plateNumber'),field(vr,'plateNumber'),vehicleRegistryFields),
  registryFields:vehicleRegistryFields,
 }:null;
 const detail=bookingDetailPresentation(row);
 if(driver)driver.eta=detail.timeline_data?.estimatedPickupAt??null;
 return {driver_data:driver,vehicle_data:vehicle,...detail};
}

// Batched, read-only and keyed by saved provider IDs, never by a reused call sign.
export const bookingAssignmentsSql=`
SELECT b.id, to_jsonb(b)-'rawPayload'-'assignmentDetails' booking_fields, COALESCE(document.raw_payload,b."rawPayload") booking_payload,
 (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.type) FROM public."BookingLocation" l WHERE l."bookingId"=b.id) location_details,
 (SELECT jsonb_agg(to_jsonb(via) ORDER BY via.position) FROM public."BookingVia" via WHERE via."bookingId"=b.id) via_details,
 jsonb_build_object('id',b."driverId",'callsign',COALESCE(b."driverCallSign",saved.driver->>'callsign'),'forename',b."driverForename",'surname',b."driverSurname",'badgeNumber',b."driverBadgeNumber",'name',COALESCE(NULLIF(concat_ws(' ',b."driverForename",b."driverSurname"),''),saved.driver->>'name'),'phone',saved.driver->>'phone') driver_snapshot,
 COALESCE(b."rawPayload"#>'{DriverDetails,Driver}',b."rawPayload"->'Driver',b."rawPayload"->'driver') driver_payload,
 jsonb_build_object('fullName',d."fullName",'forename',d.forename,'surname',d.surname,'mobile',d.mobile,'telephone',d.telephone,'badgeNumber',d."badgeNumber") driver_registry,
 jsonb_build_object('id',b."vehicleId",'callsign',COALESCE(b."vehicleCallSign",saved.vehicle->>'callsign'),'plateNumber',b."vehiclePlateNumber",'make',saved.vehicle->>'make','model',saved.vehicle->>'model','colour',saved.vehicle->>'colour','registration',COALESCE(b."vehicleRegistration",saved.vehicle->>'registration')) vehicle_snapshot,
 COALESCE(b."rawPayload"#>'{VehicleDetails,Vehicle}',b."rawPayload"->'Vehicle',b."rawPayload"->'vehicle') vehicle_payload,
 jsonb_build_object('make',v.make,'model',v.model,'colour',v.colour,'registration',v.registration,'plateNumber',v."plateNumber") vehicle_registry
FROM public."Booking" b
LEFT JOIN public.autocab_bookings document ON document.autocab_id=b."externalId" AND document.booking_id=b.id
LEFT JOIN LATERAL (
 SELECT
 CASE WHEN b."assignmentDetails"->>'provider'=b.provider AND b."assignmentDetails"->>'bookingRef'=b."externalId"
  AND ((b."driverId" IS NOT NULL AND b."assignmentDetails"#>>'{driver,id}'=b."driverId") OR (b."driverId" IS NULL AND b."assignmentDetails"#>>'{driver,legacy}'='true'))
  THEN b."assignmentDetails"->'driver' ELSE '{}'::jsonb END driver,
 CASE WHEN b."assignmentDetails"->>'provider'=b.provider AND b."assignmentDetails"->>'bookingRef'=b."externalId"
  AND ((b."vehicleId" IS NOT NULL AND b."assignmentDetails"#>>'{vehicle,id}'=b."vehicleId") OR (b."vehicleId" IS NULL AND b."assignmentDetails"#>>'{vehicle,legacy}'='true'))
  THEN b."assignmentDetails"->'vehicle' ELSE '{}'::jsonb END vehicle
) saved ON true
LEFT JOIN LATERAL (
 SELECT x.* FROM public."Driver" x WHERE x.provider=b.provider AND (x."externalId"=b."driverId" OR x.id=b."driverId")
 ORDER BY (x."externalId"=b."driverId") DESC LIMIT 1
) d ON true
LEFT JOIN LATERAL (
 SELECT x.* FROM public."Vehicle" x WHERE x.provider=b.provider AND (x."externalId"=b."vehicleId" OR x.id=b."vehicleId")
 ORDER BY (x."externalId"=b."vehicleId") DESC LIMIT 1
) v ON true
WHERE b.id=ANY($1::text[])`;

// Canonical timestamps are UTC without an offset in Postgres; JSON wall times use Autocab's London contract.
const utc=value=>value instanceof Date?value.toISOString():typeof value==='string'&&value?(/(?:Z|[+-]\d\d:\d\d)$/i.test(value)?value:value+'Z'):null;
export function bookingDetailPresentation(row){
 if(!row.booking_fields)return {};
 const b=object(row.booking_fields),raw=object(row.booking_payload),archive=object(raw.archivedBooking);
 const locations=Array.isArray(row.location_details)?row.location_details:[];
 const location=type=>{const l=locations.find(x=>x.type===type);return l?{address:l.address,zoneId:l.zoneId,zone:l.zoneName||l.zoneDescriptor,latitude:l.latitude,longitude:l.longitude,...(type==='DESTINATION'?{dueTime:utc(b.dropOffDueTime)}:{})}:null};
 const vias=Array.isArray(row.via_details)?row.via_details:[];
 const getTime=(column,...keys)=>{const source=field(raw,...keys.filter(k=>!k.includes('_')))||field(archive,...keys.filter(k=>!k.includes('_')));return source?providerTimestamp(source):utc(b[column])||sourceTimestamp(field(raw,...keys.filter(k=>k.includes('_'))))};
 return {
  pickup_data:location('PICKUP'),destination_data:location('DESTINATION'),vias_data:vias,via_points:vias,
  priority:b.priority??null,street_pickup:b.isStreetPickup??null,raw_payload:raw,
  timeline_data:{bookedAt:getTime('bookedAtTime','BookedAtTime','booked_at'),scheduledAt:getTime('pickupDueTime','PickupDueTimeUtc','PickupDueTime','pickup_due_time'),
   dropOffDueAt:getTime('dropOffDueTime','DropOffDueTime','dropOffTimeUtc','dropOffTime','dropoff_due_time'),
   dispatchedAt:getTime('dispatchedAt','DispatchedAtTime','dispatched_at'),acceptedAt:getTime('acceptedAt','AcceptedAtTime','DriverAcceptedAtTime'),
   arrivedAt:getTime('arrivedAt','VehicleArrivedAtTime','arrived_at'),onBoardAt:getTime('pickedUpAt','PickedUpAtTime','passenger_on_board_at'),
   completedAt:getTime('completedAt','CompletedAtTime','completed_at'),cancelledAt:getTime('cancelledAt','CancelledAtTime','cancelled_at'),noFareAt:getTime('noFareAt','NoFareAtTime'),
   estimatedPickupAt:providerTimestamp(field(raw,'EstimatedPickupTime','estimated_pickup_time'))||providerTimestamp(field(archive,'EstimatedPickupTime'))},
  pricing_data:Object.fromEntries(['price','cost','fare','accountAmount','cashAmount','cardAmount','extraCost','gratuityAmount','distance','systemDistance','meterDistance','meterDistanceMetres','pricingSource','estimatedDistance','estimatedPrice','estimatedTime','fixedPrice','fixedCost','waitingTime','waitingTimeChargeable'].map(key=>[key,b[key]??null]).concat([['tariff',b.pricingTariff??null],['gratuity',b.gratuityAmount??null]])),
  notes_data:{driverNote:b.driverNote,officeNote:b.officeNote,flightDetails:b.flightDetails,cabExchangeReference:b.cabExchangeReference},
 };
}
