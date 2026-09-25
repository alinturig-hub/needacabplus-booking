import {z} from 'zod';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {vehicles} from '@/lib/vehicles';

export const dynamic='force-dynamic';
const payload=z.object({id:z.string().uuid(),name:z.string().trim().min(2).max(100),phone:z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/),pickup:z.string().trim().min(5).max(250),destination:z.string().trim().min(5).max(250),viaPoints:z.array(z.string().trim().min(5).max(250)).max(3),pickupNote:z.string().trim().max(300),vehicle:z.enum(['saloon','estate','xl']),acknowledged:z.literal(true)}).strict();

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 let body;try{body=payload.parse(await request.json())}catch{return Response.json({error:'Check the addresses, name, phone number and test booking acknowledgement.'},{status:400})}
 const stops=[body.pickup,...body.viaPoints,body.destination].map(stop=>stop.toLowerCase());if(new Set(stops).size!==stops.length)return Response.json({error:'Each stop must use a different address.'},{status:400});
 try{const db=database();const fare=vehicles.find(v=>v.id===body.vehicle)!.demoPence;const existing=await db.query<{id:string;status:string}>('SELECT id,status FROM bookings WHERE id=$1',[body.id]);if(existing.rows[0])return Response.json({id:existing.rows[0].id,status:existing.rows[0].status});
 await db.query('INSERT INTO bookings (id,user_id,name,phone,pickup,destination,via_points,pickup_note,vehicle,fare_pence,status,created_at,source,payment_type,passengers,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$12)',[body.id,'public',body.name,body.phone,body.pickup,body.destination,JSON.stringify(body.viaPoints),body.pickupNote,body.vehicle,fare,'Booked',new Date().toISOString(),'WebApp','Card',1]);
 return Response.json({id:body.id,status:'Booked'},{status:201});}catch(error){return unavailable(error)}
}

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const result=await database().query(`SELECT id,external_booking_id,original_booking_id,name,phone,customer_email,passengers,luggage,
  pickup,destination,via_points,pickup_note,pickup_data,destination_data,vias_data,driver_data,vehicle_data,pricing_data,timeline_data,notes_data,
  booking_type,source,payment_type,priority,street_pickup,vehicle,fare_pence,status,last_event_type,raw_payload,created_at,updated_at
  FROM bookings ORDER BY updated_at DESC,created_at DESC LIMIT 500`);
  return Response.json({bookings:result.rows},{headers:{'Cache-Control':'no-store'}})
 }catch(error){return unavailable(error)}
}

const allowedStatuses=['Booked','Modified','Dispatched','Driver Accepted','Arrived','Passenger On Board','Running Late','Completed','Cancelled','Rejected','No Fare'] as const;
export async function PATCH(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let body;try{body=z.object({id:z.string().uuid(),status:z.enum(allowedStatuses)}).strict().parse(await request.json())}catch{return Response.json({error:'Invalid booking update.'},{status:400})}
 try{const result=await database().query('UPDATE bookings SET status=$1,updated_at=now() WHERE id=$2',[body.status,body.id]);if(!result.rowCount)return Response.json({error:'Booking not found.'},{status:404});return Response.json({ok:true})}catch(error){return unavailable(error)}
}
