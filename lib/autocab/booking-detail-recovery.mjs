import {autocabIso} from '../autocab-time.mjs';
// This feed's unoffset UTC fields match the canonical UTC columns; explicit offsets remain authoritative.
export function sourceTimestamp(value){
 if(typeof value!=='string')return null;
 const raw=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)?value+'Z':value;
 const result=autocabIso(raw);return result&&Date.parse(result)>=0?result:null;
}
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const get=(o,...keys)=>{for(const key of keys){const entry=Object.entries(obj(o)).find(([k])=>k.toLowerCase()===key.toLowerCase());if(entry&&entry[1]!==null&&entry[1]!==undefined)return entry[1]}return null};
const text=x=>typeof x==='string'&&x.trim()?x.trim():typeof x==='number'&&Number.isFinite(x)?String(x):null;
const number=x=>x!==null&&x!==''&&typeof x!=='boolean'&&Number.isFinite(Number(x))?String(x):null;
const empty=x=>x===null||x===undefined||x==='';
const states={Completed:'COMPLETED',ExchangedCompleted:'COMPLETED',Cancelled:'CANCELLED',ExchangedCancelled:'CANCELLED',NoJob:'ARCHIVED_NO_JOB',ExchangedNoJob:'ARCHIVED_NO_JOB',Dispatched:'ARCHIVED_DISPATCHED',Recover:'ARCHIVED_RECOVERED',Skipped:'ARCHIVED_SKIPPED',Suspended:'ARCHIVED_SUSPENDED'};
export function authoritativeDocuments(row,documents){return documents.filter(d=>{
 const r=obj(d.payload),a=obj(get(r,'archivedBooking')),ref=text(get(a,'originalAutoID')??get(r,'BookingId','autocab_booking_id','id'));
 if(ref&&ref!==String(row.externalId))return false;
 if(d.kind==='canonical_raw')return true;
 // Earlier routes and states must never replace a newer journey or explicit removal.
 return d.kind==='archive'&&ref===String(row.externalId)&&states[get(a,'reason')]===row.status;
})}
function location(value,flat,prefix){
 const v=obj(value),a=obj(get(v,'Address')),z=obj(get(v,'Zone')??get(a,'zone')),c=obj(get(v,'Coordinates')??get(a,'coordinate'));
 const address=text(typeof get(v,'Address')==='string'?get(v,'Address'):get(a,'text'))??text(get(flat,prefix+'_address'));
 if(!address)return null;
 const valid=(x,min,max)=>{const n=number(x);return n!==null&&Number(n)>=min&&Number(n)<=max?n:null};
 return {address,zoneId:text(get(z,'Id')??get(a,'zoneId')??get(flat,prefix+'_zone_id')),zoneName:text(get(z,'Name')??get(flat,prefix+'_zone_name')),zoneDescriptor:text(get(z,'Descriptor')),latitude:valid(get(c,'Latitude')??get(flat,prefix+'_lat'),-90,90),longitude:valid(get(c,'Longitude')??get(flat,prefix+'_lng'),-180,180)};
}
export function recoverBookingDetails(row,documents,locations=[],vias=[]){
 const patch={},sources={},locationPatches=[],viaPatches=[];
 const docs=authoritativeDocuments(row,documents);
 const dates={pickupDueTime:['PickupDueTimeUtc','PickupDueTime','pickup_due_time'],dropOffDueTime:['DropOffDueTime','DropOffTimeUtc','DropOffTime','dropoff_due_time'],bookedAtTime:['BookedAtTime','booked_at'],dispatchedAt:['DispatchedAtTime','dispatched_at'],arrivedAt:['VehicleArrivedAtTime','arrived_at'],pickedUpAt:['PickedUpAtTime','passenger_on_board_at'],completedAt:['CompletedAtTime','completed_at'],cancelledAt:['CancelledAtTime','cancelled_at'],acceptedAt:['AcceptedAtTime','DriverAcceptedAtTime'],noFareAt:['NoFareAtTime']};
 const numeric={distance:['Distance'],systemDistance:['SystemDistance'],meterDistance:['MeterDistance','meter_distance'],estimatedDistance:['EstimatedDistance'],estimatedPrice:['EstimatedPrice'],fare:['Fare'],price:['Price'],cost:['Cost'],extraCost:['ExtraCost','extra_cost'],gratuityAmount:['GratuityAmount','gratuity_amount']};
 const strings={pricingTariff:['PricingTariff','pricing_tariff'],pricingSource:['PricingSource','pricing_source'],estimatedTime:['EstimatedTime'],driverNote:['DriverNote','driver_note'],officeNote:['OfficeNote','office_note'],flightDetails:['FlightDetails','flight_details'],cabExchangeReference:['CabExchangeReference','cab_exchange_ref']};
 for(const document of docs){
  const r=obj(document.payload),a=obj(get(r,'archivedBooking')),p=obj(get(r,'Pricing')),comparison=obj(get(a,'PriceComparison')??get(r,'PriceComparison'));
  const from=(...keys)=>get(r,...keys)??get(a,...keys)??get(p,...keys)??get(comparison,...keys);
  for(const [mapping,convert] of [[dates,sourceTimestamp],[numeric,number],[strings,text]])for(const [column,keys] of Object.entries(mapping)){
   if(!empty(row[column])||!empty(patch[column]))continue;
   if(column==='completedAt'&&row.status!=='COMPLETED'||column==='cancelledAt'&&row.status!=='CANCELLED'||column==='noFareAt'&&row.status!=='NO_FARE')continue;
   const value=convert(from(...keys));if(value!==null){patch[column]=value;sources[column]={kind:document.kind,id:document.id}}
  }
  for(const [prefix,type] of [['pickup','PICKUP'],['destination','DESTINATION']]){
   const incoming=location(get(r,prefix),r,prefix);if(!incoming)continue;
   const saved=locations.find(l=>l.type===type),pending=locationPatches.find(l=>l.type===type);
   // Exact address agreement is required when supplementing an existing location.
   if(saved&&saved.address!==incoming.address)continue;
   const target=pending??{type,address:incoming.address};
   for(const [key,value] of Object.entries(incoming))if(!empty(value)&&empty(saved?.[key])&&empty(target[key]))target[key]=value;
   if(!pending&&Object.keys(target).length>2)locationPatches.push(target);
  }
 }
 // The canonical JSON is the latest journey, including an explicit empty vias list.
 const own=docs.find(d=>d.kind==='canonical_raw');const rawVias=get(own?.payload,'Vias');
 if(Array.isArray(rawVias))rawVias.forEach((v,position)=>{
  const incoming=location(v,{},'via');if(!incoming)return;
  const saved=vias.find(x=>x.position===position);if(saved&&saved.address!==incoming.address)return;
  const target={position,address:incoming.address};
  for(const [key,value] of Object.entries(incoming))if(!empty(value)&&empty(saved?.[key])&&empty(target[key]))target[key]=value;
  if(Object.keys(target).length>2)viaPatches.push(target);
 });
 return {patch,sources,locations:locationPatches,vias:viaPatches};
}
