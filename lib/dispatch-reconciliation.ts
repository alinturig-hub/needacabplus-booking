import {autocabTime} from '@/lib/autocab-time.mjs';
import {database} from '@/lib/database';
import {readBookingDetails} from '@/lib/autocab-api';
import {archivedBookingStatus} from './dispatch-queue';
const checked=new Map<string,number>();
let running:Promise<void>|null=null;
let nextCheck=0;
// Read-only Autocab reconciliation. Never closes a job merely because it is old.
export async function reconcileOverdueBookings(){
 if(running)return running;
 if(Date.now()<nextCheck)return;
 nextCheck=Date.now()+60000;
 running=(async()=>{
  const db=database();
  const rows=await db.query("SELECT id,external_booking_id,updated_at::text AS version,COALESCE(timeline_data->>'scheduledAt',pickup_data->>'dueTime') AS due_at FROM bookings WHERE external_booking_id IS NOT NULL AND status NOT IN ('Completed','Cancelled','No Fare') AND COALESCE(pricing_data->>'testBooking','false')<>'true' ORDER BY updated_at ASC LIMIT 100");
  const stale=rows.rows.filter(row=>Number.isFinite(autocabTime(row.due_at))&&autocabTime(row.due_at)<Date.now()).sort((a,b)=>(checked.get(a.id)||0)-(checked.get(b.id)||0)).slice(0,3);
  await Promise.all(stale.map(async row=>{
   checked.set(row.id,Date.now());
   try{
    const payload=await readBookingDetails(row.external_booking_id),status=archivedBookingStatus(payload);
    if(status)await db.query('UPDATE bookings SET status=$2,updated_at=now() WHERE id=$1 AND updated_at=$3',[row.id,status,row.version]);
   }catch{console.error('Overdue booking status could not be verified with Autocab.')}
  }));
  if(checked.size>1000)checked.clear();
 })().finally(()=>{running=null});
 return running;
}
