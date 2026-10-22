import {bookingServiceTimingSql,timingPolicy} from '@/lib/booking-service-timing.mjs';
import type {PoolClient} from 'pg';
import {bookingAssignmentsSql,bookingAssignmentPresentation} from '@/lib/booking-assignment-presentation.mjs';
export async function canonicalBookingAssignments(client:PoolClient,ids:string[]):Promise<Map<string,ReturnType<typeof bookingAssignmentPresentation>>>{
 if(!ids.length)return new Map<string,ReturnType<typeof bookingAssignmentPresentation>>();
 const result=await client.query<Record<string,unknown>&{id:string}>(bookingAssignmentsSql,[ids]);
 const entries=result.rows.map(row=>({row,detail:bookingAssignmentPresentation(row)}));
 const policy=timingPolicy();
 const timing=await client.query<{id:string;service_timing:Record<string,unknown>}>(bookingServiceTimingSql,[JSON.stringify(entries.map(({row,detail})=>({id:row.id,b:row.booking_fields,t:detail.timeline_data,raw:row.booking_payload}))),null,policy.asap,policy.severe]);
 const byId=new Map(timing.rows.map(row=>[row.id,row.service_timing]));
 return new Map(entries.map(({row,detail})=>[row.id,{...detail,service_timing:byId.get(row.id)??null}]));
}
