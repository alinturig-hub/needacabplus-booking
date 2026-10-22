import type {PoolClient} from 'pg';
import {bookingAssignmentsSql,bookingAssignmentPresentation} from '@/lib/booking-assignment-presentation.mjs';
export async function canonicalBookingAssignments(client:PoolClient,ids:string[]){
 if(!ids.length)return new Map<string,ReturnType<typeof bookingAssignmentPresentation>>();
 const result=await client.query<Record<string,unknown>&{id:string}>(bookingAssignmentsSql,[ids]);
 return new Map(result.rows.map(row=>[row.id,bookingAssignmentPresentation(row)]));
}
