import {database} from '@/lib/database';
import {isAdmin,unavailable} from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403,headers:{'X-Booking-Audit-Version':'audit-recovery-v2'}});
 try{
  const db=database();
  const runs=await db.query('SELECT * FROM booking_database_audits ORDER BY started_at DESC LIMIT 1');
  const run=runs.rows[0];
  const counts=run?await db.query("SELECT count(*) FILTER(WHERE checked_at IS NOT NULL)::int AS checked,count(*) FILTER(WHERE result ? 'error')::int AS errors,count(*) FILTER(WHERE jsonb_array_length(result->'differences')>0)::int AS mismatches,count(*) FILTER(WHERE (result->>'localChangedSinceSnapshot')::boolean)::int AS changed_during_audit FROM booking_database_audit_items WHERE audit_id=$1",[run.id]):{rows:[]};
  const differences=run?await db.query("SELECT field,count(*)::int AS bookings FROM booking_database_audit_items CROSS JOIN LATERAL jsonb_array_elements_text(result->'differences') field WHERE audit_id=$1 GROUP BY field ORDER BY count(*) DESC",[run.id]):{rows:[]};
  const errors=run?await db.query("SELECT result->>'error' AS reason,count(*)::int AS bookings FROM booking_database_audit_items WHERE audit_id=$1 AND result ? 'error' GROUP BY result->>'error' ORDER BY count(*) DESC",[run.id]):{rows:[]};
  const modified=await db.query('SELECT field,count(*)::int AS updates FROM booking_modified_audit CROSS JOIN LATERAL unnest(changed_fields) field GROUP BY field ORDER BY count(*) DESC');
  return Response.json({run:run||null,counts:counts.rows[0]||null,differences:differences.rows,modifiedFields:modified.rows,errors:errors.rows,stalled:Boolean(run?.status==='running'&&Date.now()-new Date(run.heartbeat_at||run.started_at).getTime()>120000)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
