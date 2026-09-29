import {database} from '@/lib/database';
import {summarizeBookingReferences,type BookingReferenceRow} from '@/lib/booking-reference';
import {isAdmin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const rows=await database().query<BookingReferenceRow>(`SELECT external_booking_id,
   COALESCE(NULLIF(notes_data->>'ourReference',''),NULLIF(raw_payload#>>'{booking,ourReference}',''),NULLIF(raw_payload#>>'{metadata,ourReference}',''),NULLIF(raw_payload#>>'{data,booking,ourReference}',''),NULLIF(raw_payload#>>'{data,metadata,ourReference}',''),NULLIF(raw_payload#>>'{data,ourReference}',''),NULLIF(raw_payload->>'ourReference','')) AS our_reference,
   COALESCE(notes_data->'yourReferences',raw_payload#>'{booking,yourReferences}',raw_payload#>'{metadata,yourReferences}',raw_payload#>'{data,booking,yourReferences}',raw_payload#>'{data,metadata,yourReferences}',raw_payload#>'{data,yourReferences}',raw_payload->'yourReferences','{}'::jsonb) AS your_references
   FROM bookings ORDER BY created_at DESC`);
  return Response.json({...summarizeBookingReferences(rows.rows),checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
