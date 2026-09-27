import {database} from '@/lib/database';
import {isAdmin,unavailable} from '@/lib/security';
import {aggregateDispatch,bookingMetrics,receiptText,type Receipt} from '@/lib/dispatch-analytics';
import {operationKind} from '@/lib/dispatch-history';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const bookingId=new URL(request.url).searchParams.get('bookingId');
 if(bookingId&&bookingId.length>100)return Response.json({error:'Invalid booking reference.'},{status:400});
 try{
  const db=database();
  const result=await db.query<Receipt>(`SELECT o.*,COALESCE(o.driver_callsign,d.callsign) AS driver_callsign,COALESCE(o.vehicle_callsign,v.callsign) AS vehicle_callsign FROM dispatch_observations o LEFT JOIN autocab_drivers d ON d.external_id=o.driver_id LEFT JOIN autocab_vehicles v ON v.external_id=o.vehicle_id WHERE ${bookingId?'o.booking_id=$1':"o.received_at>=now()-interval '30 days'"} ORDER BY o.received_at DESC,o.id DESC LIMIT ${bookingId?1001:20001}`,bookingId?[bookingId]:[]);
  const limit=bookingId?1000:20000,partial=result.rows.length>limit;
  const rows=result.rows.slice(0,limit).map(row=>({...row,received_at:new Date(row.received_at).toISOString(),source_at:row.source_at?new Date(row.source_at).toISOString():null,kind:row.kind||operationKind(row.event_type)}));
  if(bookingId){
   const recommendations=await db.query('SELECT vehicle_id,details,recorded_at FROM dispatch_recommendations WHERE booking_id=$1 ORDER BY recorded_at DESC LIMIT 20',[bookingId]);
   const metrics=bookingMetrics(rows);
   return Response.json({bookingId,partial,metrics:{offers:metrics.attempts.length,matchedResponses:metrics.attempts.filter(row=>row.response).length,offerToAcceptSeconds:metrics.offerToAcceptSeconds,acceptToArrivalSeconds:metrics.acceptToArrivalSeconds,receiptTimed:metrics.receiptTimed},events:metrics.rows.map(row=>({...row,title:receiptText(row)})),recommendations:recommendations.rows,generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  }
  const summary=aggregateDispatch(rows);
  return Response.json({summary,partial,windowDays:30,eventsAnalyzed:rows.length,receiptTimed:rows.some(row=>!row.source_at),generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
