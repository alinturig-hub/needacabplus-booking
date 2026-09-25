import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';

type JsonObject=Record<string,unknown>;
const object=(value:unknown):JsonObject|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:undefined;
const key=(value:JsonObject,name:string)=>Object.entries(value).find(([candidate])=>candidate.toLowerCase()===name.toLowerCase())?.[1];
const path=(value:unknown,...parts:string[])=>parts.reduce<unknown>((current,part)=>object(current)?key(object(current)!,part):undefined,value);
const first=(...values:unknown[])=>values.find(value=>value!==undefined&&value!==null&&value!=='');
const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value).trim()||undefined:undefined;
const number=(value:unknown)=>{const parsed=typeof value==='number'?value:Number(value);return Number.isFinite(parsed)?parsed:undefined};
const boolean=(value:unknown)=>typeof value==='boolean'?value:typeof value==='string'?value.toLowerCase()==='true'?true:value.toLowerCase()==='false'?false:undefined:undefined;

function deepFind(value:unknown,names:string[],depth=0):unknown{
 if(depth>5)return undefined;
 const record=object(value);if(!record)return undefined;
 for(const name of names){const found=key(record,name);if(found!==undefined&&found!==null&&found!=='')return found}
 for(const child of Object.values(record)){if(object(child)){const found=deepFind(child,names,depth+1);if(found!==undefined)return found}}
 return undefined;
}

function address(value:unknown):JsonObject|undefined{
 const root=object(value);if(!root)return undefined;
 const detail=object(key(root,'address'))||root;
 const coordinate=object(first(key(detail,'coordinate'),key(detail,'coordinates')))||{};
 const zone=object(key(detail,'zone'))||{};
 return {
  address:text(first(key(detail,'text'),key(detail,'address'),key(detail,'displayAddress'),key(detail,'street'))),
  street:text(key(detail,'street')),town:text(first(key(detail,'town'),key(detail,'city'))),postCode:text(first(key(detail,'postCode'),key(detail,'postcode'))),
  zoneId:text(first(key(detail,'zoneId'),key(zone,'id'))),zone:text(first(key(zone,'name'),key(detail,'zoneName'),key(detail,'zone'))),
  latitude:number(first(key(coordinate,'latitude'),key(detail,'latitude'),key(detail,'lat'))),longitude:number(first(key(coordinate,'longitude'),key(detail,'longitude'),key(detail,'lng'),key(detail,'lon'))),
  dueTime:text(first(key(root,'dueTime'),key(root,'pickupDueTime'),key(root,'dropoffDueTime'))),note:text(key(root,'note'))
 };
}

const statusByEvent:Record<string,string>={
 bookingcreated:'Booked',bookingmodified:'Modified',bookingdispatched:'Dispatched',bookingdispatchoffered:'Dispatched',bookingdispatchaccepted:'Driver Accepted',
 bookingarrived:'Arrived',passengeronboard:'Passenger On Board',bookingcomplete:'Completed',bookingcompleted:'Completed',bookingcancelled:'Cancelled',
 bookingrecovered:'Booked',bookingrejected:'Rejected',bookingrunninglate:'Running Late',nofare:'No Fare'
};
const cleanObject=(value:JsonObject|undefined)=>value&&Object.values(value).some(item=>item!==undefined&&item!==null&&item!=='')?value:undefined;

export async function saveAutocabBooking(db:Pool,payload:unknown,eventType:string){
 const root=object(payload);if(!root)return {saved:false,reason:'Payload is not an object'};
 const booking=object(first(path(root,'booking'),path(root,'metadata'),path(root,'data','booking'),path(root,'data','metadata'),path(root,'data'),root))||root;
 const externalId=text(first(key(booking,'bookingId'),key(booking,'bookingID'),key(booking,'bookingReference'),key(booking,'reference'),key(booking,'id'),key(root,'bookingId'),key(root,'bookingID')));
 if(!externalId)return {saved:false,reason:'No booking ID found'};

 const pickupRaw=first(key(booking,'pickup'),key(booking,'pickupAddress'),key(booking,'origin'));
 const destinationRaw=first(key(booking,'destination'),key(booking,'dropoff'),key(booking,'dropOff'),key(booking,'destinationAddress'));
 const pickup=cleanObject({...address(pickupRaw),dueTime:text(first(key(booking,'pickupDueTime'),path(pickupRaw,'pickupDueTime')))});const destination=cleanObject({...address(destinationRaw),dueTime:text(first(key(booking,'dropOffDueTime'),key(booking,'dropoffDueTime'),path(destinationRaw,'dropoffDueTime')))});
 const driverRaw=object(first(key(booking,'driver'),path(booking,'driverDetails','driver'),key(root,'driver')));
 const driver=driverRaw?{...driverRaw,name:text(first(key(driverRaw,'name'),[text(key(driverRaw,'forename')),text(key(driverRaw,'surname'))].filter(Boolean).join(' ')))}:undefined;
 const vehicle=object(first(key(booking,'vehicle'),path(booking,'vehicleDetails','vehicle'),key(root,'vehicle')));
 const pricingSource=object(key(booking,'pricing'));
 const pricing=cleanObject({
  price:number(first(key(pricingSource||{},'price'),key(booking,'price'),key(booking,'totalPrice'),deepFind(booking,['price']))),cost:number(first(key(pricingSource||{},'cost'),key(booking,'cost'),deepFind(booking,['cost']))),
  fare:number(first(key(pricingSource||{},'fare'),key(booking,'fare'),key(booking,'fareAmount'))),extraCost:number(first(key(pricingSource||{},'extraCost'),key(booking,'extraCost'),key(booking,'extras'))),
  gratuity:number(first(key(pricingSource||{},'gratuityAmount'),key(booking,'gratuity'),key(booking,'tip'))),distance:number(first(key(booking,'distance'),key(booking,'systemDistance'),key(booking,'journeyDistance'))),
  meterDistance:number(key(booking,'meterDistance')),tariff:text(first(key(pricingSource||{},'pricingTariff'),key(booking,'tariff'),key(booking,'tariffName'))),pricingSource:text(first(key(pricingSource||{},'pricingSource'),key(booking,'pricingSource')))
 });
 const eventStatus=statusByEvent[eventType.toLowerCase().replace(/[^a-z]/g,'')];
 const payloadStatus=text(first(key(booking,'status'),key(root,'status')));
 const status=eventStatus||payloadStatus||'Booked';
 const timeline=cleanObject({
  bookedAt:text(first(key(booking,'bookedAt'),key(booking,'bookedAtTime'),key(booking,'createdAt'),key(root,'createdAt'))),scheduledAt:text(first(key(booking,'scheduledAt'),key(booking,'pickupDueTime'),path(pickupRaw,'pickupDueTime'))),
  dispatchedAt:text(first(key(booking,'dispatchedAt'),key(booking,'dispatchedAtTime'),eventStatus==='Dispatched'?new Date().toISOString():undefined)),arrivedAt:text(first(key(booking,'arrivedAt'),key(booking,'vehicleArrivedAtTime'),eventStatus==='Arrived'?new Date().toISOString():undefined)),
  onBoardAt:text(first(key(booking,'onBoardAt'),key(booking,'pickedUpAtTime'),eventStatus==='Passenger On Board'?new Date().toISOString():undefined)),completedAt:text(first(key(booking,'completedAt'),key(booking,'completedAtTime'),eventStatus==='Completed'?new Date().toISOString():undefined)),
  cancelledAt:text(first(key(booking,'cancelledAt'),key(booking,'cancelledAtTime'),eventStatus==='Cancelled'?new Date().toISOString():undefined))
 });
 const notes=cleanObject({driverNote:text(first(key(booking,'driverNote'),path(pickupRaw,'note'))),officeNote:text(key(booking,'officeNote')),flightDetails:text(first(key(booking,'flightDetails'),key(booking,'flightNumber'))),cabExchangeReference:text(first(key(booking,'cabExchangeAgentBookingRef'),key(booking,'cabExchangeReference'),key(booking,'cabExchangeRef'))) });
 const name=text(first(key(booking,'name'),key(booking,'customerName'),path(booking,'customer','name'),deepFind(booking,['passengerName'])));
 const phone=text(first(key(booking,'telephoneNumber'),key(booking,'phone'),key(booking,'phoneNumber'),path(booking,'customer','phone')));
 const email=text(first(key(booking,'customerEmail'),key(booking,'email'),path(booking,'customer','email')));
 const source=text(first(key(booking,'bookingSource'),key(booking,'source')));
 const payment=text(first(key(booking,'paymentType'),key(booking,'paymentMethod')));
 const price=number(first(pricing?.price,pricing?.fare));const farePence=price===undefined?0:Math.max(0,Math.round(price*100));
 const vias=first(key(booking,'vias'),key(booking,'viaPoints'));
 const created=text(first(timeline?.bookedAt,key(booking,'createdAt')))||new Date().toISOString();

 await db.query(`INSERT INTO bookings (
   id,user_id,name,phone,pickup,destination,via_points,pickup_note,vehicle,fare_pence,status,created_at,
   external_booking_id,original_booking_id,booking_type,source,payment_type,priority,street_pickup,customer_email,passengers,luggage,
   pickup_data,destination_data,vias_data,driver_data,vehicle_data,pricing_data,timeline_data,notes_data,raw_payload,last_event_type,updated_at
  ) VALUES ($1,'autocab',$2,$3,$4,$5,$6::jsonb,$7,'saloon',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb,$23::jsonb,$24::jsonb,$25::jsonb,$26::jsonb,$27::jsonb,$28::jsonb,$29::jsonb,$30,now())
  ON CONFLICT (external_booking_id) WHERE external_booking_id IS NOT NULL DO UPDATE SET
   name=COALESCE($31,bookings.name),phone=COALESCE($32,bookings.phone),pickup=COALESCE($33,bookings.pickup),destination=COALESCE($34,bookings.destination),
   via_points=COALESCE($35::jsonb,bookings.via_points),pickup_note=COALESCE($36,bookings.pickup_note),fare_pence=CASE WHEN $37::integer>0 THEN $37 ELSE bookings.fare_pence END,
   status=$9,original_booking_id=COALESCE($12,bookings.original_booking_id),booking_type=COALESCE($13,bookings.booking_type),source=COALESCE($14,bookings.source),payment_type=COALESCE($15,bookings.payment_type),
   priority=COALESCE($16,bookings.priority),street_pickup=COALESCE($17,bookings.street_pickup),customer_email=COALESCE($18,bookings.customer_email),passengers=COALESCE($19,bookings.passengers),luggage=COALESCE($20,bookings.luggage),
   pickup_data=COALESCE(bookings.pickup_data,'{}'::jsonb)||COALESCE($21::jsonb,'{}'::jsonb),destination_data=COALESCE(bookings.destination_data,'{}'::jsonb)||COALESCE($22::jsonb,'{}'::jsonb),
   vias_data=COALESCE($23::jsonb,bookings.vias_data),driver_data=COALESCE(bookings.driver_data,'{}'::jsonb)||COALESCE($24::jsonb,'{}'::jsonb),vehicle_data=COALESCE(bookings.vehicle_data,'{}'::jsonb)||COALESCE($25::jsonb,'{}'::jsonb),
   pricing_data=COALESCE(bookings.pricing_data,'{}'::jsonb)||COALESCE($26::jsonb,'{}'::jsonb),timeline_data=COALESCE(bookings.timeline_data,'{}'::jsonb)||COALESCE($27::jsonb,'{}'::jsonb),notes_data=COALESCE(bookings.notes_data,'{}'::jsonb)||COALESCE($28::jsonb,'{}'::jsonb),
   raw_payload=$29::jsonb,last_event_type=$30,updated_at=now()`,[
   randomUUID(),name||'Unknown passenger',phone||'Not supplied',pickup?.address||'Address pending',destination?.address||'Address pending',JSON.stringify(Array.isArray(vias)?vias:[]),text(notes?.driverNote)||'',farePence,status,created,
   externalId,text(first(key(booking,'originalBookingId'),key(booking,'originalId'))),text(first(key(booking,'typeOfBooking'),key(booking,'bookingType'),key(booking,'type'))),source,payment,number(key(booking,'priority')),boolean(first(key(booking,'streetPickup'),key(booking,'isStreetPickup'))),email,number(key(booking,'passengers')),number(key(booking,'luggage')),
   pickup?JSON.stringify(pickup):null,destination?JSON.stringify(destination):null,Array.isArray(vias)?JSON.stringify(vias):null,driver?JSON.stringify(driver):null,vehicle?JSON.stringify(vehicle):null,pricing?JSON.stringify(pricing):null,timeline?JSON.stringify(timeline):null,notes?JSON.stringify(notes):null,JSON.stringify(payload),eventType,
   name,phone,pickup?.address,destination?.address,Array.isArray(vias)?JSON.stringify(vias):null,text(notes?.driverNote),farePence
  ]);
 return {saved:true,externalBookingId:externalId,status};
}
