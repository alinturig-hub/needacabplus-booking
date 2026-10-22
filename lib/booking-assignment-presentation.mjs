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
 const driver=field(ds,'id','callsign')?{
  id:field(ds,'id'),callsign:field(ds,'callsign'),
  name:fallback('name',fullName(ds),fullName(dp),fullName(dr),driverRegistryFields),
  phone:fallback('phone',field(ds,'phone'),field(dp,'mobile','telephoneNumber','telephone','phone'),field(dr,'mobile','telephone'),driverRegistryFields),
  badgeNumber:fallback('badgeNumber',field(ds,'badgeNumber'),field(dp,'badgeNumber'),field(dr,'badgeNumber'),driverRegistryFields),
  eta:null,registryFields:driverRegistryFields,
 }:null;
 const vehicle=field(vs,'id','callsign')?{
  id:field(vs,'id'),vehicleCallsign:field(vs,'callsign'),
  make:fallback('make',null,field(vp,'make'),field(vr,'make'),vehicleRegistryFields),
  model:fallback('model',null,field(vp,'model'),field(vr,'model'),vehicleRegistryFields),
  colour:fallback('colour',null,field(vp,'colour','color'),field(vr,'colour'),vehicleRegistryFields),
  registration:fallback('registration',field(vs,'registration'),field(vp,'registration'),field(vr,'registration'),vehicleRegistryFields),
  plateNumber:fallback('plateNumber',field(vs,'plateNumber'),field(vp,'plateNumber'),field(vr,'plateNumber'),vehicleRegistryFields),
  registryFields:vehicleRegistryFields,
 }:null;
 return {driver_data:driver,vehicle_data:vehicle};
}

// Batched, read-only and keyed by saved provider IDs, never by a reused call sign.
export const bookingAssignmentsSql=`
SELECT b.id,
 jsonb_build_object('id',b."driverId",'callsign',b."driverCallSign",'forename',b."driverForename",'surname',b."driverSurname",'badgeNumber',b."driverBadgeNumber") driver_snapshot,
 COALESCE(b."rawPayload"#>'{DriverDetails,Driver}',b."rawPayload"->'Driver',b."rawPayload"->'driver') driver_payload,
 jsonb_build_object('fullName',d."fullName",'forename',d.forename,'surname',d.surname,'mobile',d.mobile,'telephone',d.telephone,'badgeNumber',d."badgeNumber") driver_registry,
 jsonb_build_object('id',b."vehicleId",'callsign',b."vehicleCallSign",'registration',b."vehicleRegistration",'plateNumber',b."vehiclePlateNumber") vehicle_snapshot,
 COALESCE(b."rawPayload"#>'{VehicleDetails,Vehicle}',b."rawPayload"->'Vehicle',b."rawPayload"->'vehicle') vehicle_payload,
 jsonb_build_object('make',v.make,'model',v.model,'colour',v.colour,'registration',v.registration,'plateNumber',v."plateNumber") vehicle_registry
FROM public."Booking" b
LEFT JOIN LATERAL (
 SELECT x.* FROM public."Driver" x WHERE x.provider=b.provider AND (x."externalId"=b."driverId" OR x.id=b."driverId")
 ORDER BY (x."externalId"=b."driverId") DESC LIMIT 1
) d ON true
LEFT JOIN LATERAL (
 SELECT x.* FROM public."Vehicle" x WHERE x.provider=b.provider AND (x."externalId"=b."vehicleId" OR x.id=b."vehicleId")
 ORDER BY (x."externalId"=b."vehicleId") DESC LIMIT 1
) v ON true
WHERE b.id=ANY($1::text[])`;
