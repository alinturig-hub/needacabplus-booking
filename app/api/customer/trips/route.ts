import {getCustomer} from '@/lib/customer-auth';
import {database} from '@/lib/database';
import {unavailable} from '@/lib/security';

type TripRow={id:string;external_booking_id:string|null;pickup:string;destination:string;via_points:unknown;vehicle:string;fare_pence:number;status:string;booking_type:string|null;payment_type:string|null;timeline_data:Record<string,unknown>|null;created_at:string|Date};

export async function GET(){
 const customer=await getCustomer();
 if(!customer)return Response.json({error:'Sign in to view your journeys.'},{status:401,headers:{'Cache-Control':'no-store'}});
 try{
  const result=await database().query<TripRow>('SELECT id,external_booking_id,pickup,destination,via_points,vehicle,fare_pence,status,booking_type,payment_type,timeline_data,created_at FROM bookings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[customer.id]);
  return Response.json({trips:result.rows.map(row=>({id:row.id,reference:row.external_booking_id||`NAC-${row.id.slice(0,8).toUpperCase()}`,pickup:row.pickup,destination:row.destination,viaPoints:Array.isArray(row.via_points)?row.via_points:[],vehicle:row.vehicle,farePence:Number(row.fare_pence),status:row.status,bookingType:row.booking_type,paymentType:row.payment_type,scheduledAt:typeof row.timeline_data?.scheduledAt==='string'?row.timeline_data.scheduledAt:null,createdAt:new Date(row.created_at).toISOString()}))},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
