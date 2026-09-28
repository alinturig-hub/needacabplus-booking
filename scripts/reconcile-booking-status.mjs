// Update only a version that has not changed while Autocab was being read.
export function terminalStatus(remote){
 const reason=String(remote?.archivedBooking?.reason||'').toLowerCase().replace(/[^a-z]/g,'');
 return ({completed:'Completed',cancelled:'Cancelled',canceled:'Cancelled',nofare:'No Fare'})[reason]||null;
}
export async function applyVerifiedStatus(db,row,remote,lookupReference){
 const status=terminalStatus(remote);
 const result=await db.query(`UPDATE bookings SET status=COALESCE($2,status),
 updated_at=CASE WHEN $2::text IS NOT NULL AND status<>$2 THEN now() ELSE updated_at END,
 status_checked_at=now(),status_check_result=$4::jsonb
 WHERE id=$1 AND updated_at=$3 AND status NOT IN ('Completed','Cancelled','No Fare')`,
 [row.id,status,row.version,JSON.stringify({status:status||'unresolved',lookupReference,checkedAt:new Date().toISOString()})]);
 return result.rowCount;
}
