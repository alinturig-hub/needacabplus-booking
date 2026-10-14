import {getCustomer} from '@/lib/customer-auth';
import {bookingAttemptDatabase,database} from '@/lib/database';
import {unavailable} from '@/lib/security';
import {taxiCrmCustomerReadEnabled} from '@/lib/taxicrm-database';
import {taxiCrmCustomerTrips} from '@/lib/taxicrm-customer-trips';

type TripRow={id:string;external_booking_id:string|null;pickup:string;destination:string;via_points:unknown;vehicle:string;fare_pence:number;status:string;booking_type:string|null;payment_type:string|null;timeline_data:Record<string,unknown>|null;created_at:string|Date};

export async function GET(){
 const customer=await getCustomer();
 if(!customer)return Response.json({error:'Sign in to view your journeys.'},{status:401,headers:{'Cache-Control':'no-store'}});
 try{
  if(taxiCrmCustomerReadEnabled()){
   const attempts=await bookingAttemptDatabase().query<{quote_id:string;external_booking_id:string}>(`SELECT quote_id,external_booking_id FROM web_booking_attempts WHERE user_id=$1 AND external_booking_id IS NOT NULL ORDER BY updated_at DESC LIMIT 30`,[customer.id]);
   const trips=await taxiCrmCustomerTrips(attempts.rows.map(row=>row.external_booking_id));
   const quoteIds=new Map(attempts.rows.map(row=>[row.external_booking_id,row.quote_id]));
   return Response.json({trips:trips.map(row=>({id:quoteIds.get(row.externalId)||row.externalId,reference:row.externalId,pickup:row.pickup,destination:row.destination,viaPoints:row.viaPoints,vehicle:row.vehicle,farePence:row.farePence,status:row.status,bookingType:row.bookingType,paymentType:row.paymentType,scheduledAt:row.scheduledAt,createdAt:row.createdAt}))},{headers:{'Cache-Control':'no-store','X-Data-Source':'TaxiCRM'}});
  }
  const result=await database().query<TripRow>('SELECT id,external_booking_id,pickup,destination,via_points,vehicle,fare_pence,status,booking_type,payment_type,timeline_data,created_at FROM bookings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[customer.id]);
  return Response.json({trips:result.rows.map(row=>({id:row.id,reference:row.external_booking_id||`NAC-${row.id.slice(0,8).toUpperCase()}`,pickup:row.pickup,destination:row.destination,viaPoints:Array.isArray(row.via_points)?row.via_points:[],vehicle:row.vehicle,farePence:Number(row.fare_pence),status:row.status,bookingType:row.booking_type,paymentType:row.payment_type,scheduledAt:typeof row.timeline_data?.scheduledAt==='string'?row.timeline_data.scheduledAt:null,createdAt:new Date(row.created_at).toISOString()}))},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
