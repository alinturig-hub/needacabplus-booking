import {database} from '@/lib/database';
import {isAdmin,sameOrigin} from '@/lib/security';
import {taxiCrmBookingReadEnabled,taxiCrmNoBookingCopyEnabled,taxiCrmWebhookIngestDisabled,withTaxiCrmReadOnly} from '@/lib/taxicrm-database';

export const dynamic='force-dynamic';

async function snapshot(){
 const db=database();
 const summary=await db.query<{total:string;external:string;without_external:string;test:string}>(`SELECT count(*)::text total,
  count(*) FILTER(WHERE external_booking_id IS NOT NULL)::text external,
  count(*) FILTER(WHERE external_booking_id IS NULL)::text without_external,
  count(*) FILTER(WHERE pricing_data->>'testBooking'='true')::text test FROM bookings`);
 const external=await db.query<{external_booking_id:string;original_booking_id:string|null;status:string;updated_at:Date|string}>(`SELECT external_booking_id,original_booking_id,status,updated_at FROM bookings
  WHERE external_booking_id IS NOT NULL AND COALESCE(pricing_data->>'testBooking','false')<>'true' ORDER BY external_booking_id`);
 const ids=external.rows.map(row=>row.external_booking_id);
 const found=new Set<string>();
 await withTaxiCrmReadOnly(async client=>{
  for(let offset=0;offset<ids.length;offset+=500){
   const result=await client.query<{external_id:string}>(`SELECT "externalId" external_id FROM public."Booking"
    WHERE provider='AUTOCAB' AND "externalId"=ANY($1::text[])`,[ids.slice(offset,offset+500)]);
   result.rows.forEach(row=>found.add(row.external_id));
  }
 });
 const missing=ids.filter(id=>!found.has(id));
 const missingSet=new Set(missing),missingRows=external.rows.filter(row=>missingSet.has(row.external_booking_id));
 const missingByStatus:Record<string,number>={},missingByYear:Record<string,number>={};
 for(const row of missingRows){missingByStatus[row.status]=(missingByStatus[row.status]||0)+1;const year=String(new Date(row.updated_at).getUTCFullYear());missingByYear[year]=(missingByYear[year]||0)+1}
 const missingRecent7Days=missingRows.filter(row=>new Date(row.updated_at).getTime()>Date.now()-7*86400000).length;
 const alternateIds=[...new Set(missingRows.map(row=>row.original_booking_id).filter((id):id is string=>Boolean(id)))];
 const alternateFound=new Set<string>();
 await withTaxiCrmReadOnly(async client=>{
  for(let offset=0;offset<alternateIds.length;offset+=500){
   const result=await client.query<{external_id:string}>(`SELECT "externalId" external_id FROM public."Booking"
    WHERE provider='AUTOCAB' AND "externalId"=ANY($1::text[])`,[alternateIds.slice(offset,offset+500)]);
   result.rows.forEach(row=>alternateFound.add(row.external_id));
  }
 });
 const stillMissing=missingRows.filter(row=>!row.original_booking_id||!alternateFound.has(row.original_booking_id));
 const originalReferences=[...new Set(stillMissing.flatMap(row=>[row.external_booking_id,row.original_booking_id].filter((id):id is string=>Boolean(id))))];
 const crmOriginalFound=new Set<string>();
 if(originalReferences.length)await withTaxiCrmReadOnly(async client=>{
  const result=await client.query<{original_booking_id:string}>(`SELECT DISTINCT "originalBookingId" original_booking_id FROM public."Booking"
   WHERE provider='AUTOCAB' AND "originalBookingId"=ANY($1::text[])`,[originalReferences]);
  result.rows.forEach(row=>crmOriginalFound.add(row.original_booking_id));
 });
 const unmatched=stillMissing.filter(row=>!crmOriginalFound.has(row.external_booking_id)&&(!row.original_booking_id||!crmOriginalFound.has(row.original_booking_id)));
 const unmatchedByStatus:Record<string,number>={};for(const row of unmatched)unmatchedByStatus[row.status]=(unmatchedByStatus[row.status]||0)+1;
 const retainedReferences=unmatched.filter(row=>!['Completed','Cancelled','Rejected','No Fare'].includes(row.status)).map(row=>row.external_booking_id);
 return {total:Number(summary.rows[0].total),external:Number(summary.rows[0].external),withoutExternal:Number(summary.rows[0].without_external),test:Number(summary.rows[0].test),checkedExternal:ids.length,matchedInTaxiCrm:found.size,missingInTaxiCrm:missing.length,missingReferences:missing.slice(0,20),missingByStatus,missingByYear,missingRecent7Days,matchedByOriginalId:missingRows.length-stillMissing.length,matchedByTaxiCrmOriginalId:stillMissing.length-unmatched.length,unmatchedAfterOriginalId:unmatched.length,unmatchedByStatus,unmatchedReferences:unmatched.slice(0,20).map(row=>row.external_booking_id),retainedReferences};
}

export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 if(!taxiCrmBookingReadEnabled()||!taxiCrmNoBookingCopyEnabled()||!taxiCrmWebhookIngestDisabled())return Response.json({error:'TaxiCRM-only booking mode is not active.'},{status:409});
 const params=new URL(request.url).searchParams;
 if(params.get('export')==='1'){
  const page=Number(params.get('page'));
  if(!Number.isInteger(page)||page<0)return Response.json({error:'Invalid export page.'},{status:400});
  const rows=await database().query('SELECT row_to_json(bookings) AS booking FROM bookings ORDER BY id LIMIT 1000 OFFSET $1',[page*1000]);
  return Response.json({page,bookings:rows.rows.map(row=>row.booking)},{headers:{'Cache-Control':'no-store'}});
 }
 try{return Response.json(await snapshot(),{headers:{'Cache-Control':'no-store'}})}
 catch(error){console.error('Booking cleanup preview failed',error instanceof Error?error.name:'Unknown');return Response.json({error:'Could not verify local bookings against TaxiCRM.'},{status:502})}
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 if(!taxiCrmBookingReadEnabled()||!taxiCrmNoBookingCopyEnabled()||!taxiCrmWebhookIngestDisabled())return Response.json({error:'TaxiCRM-only booking mode is not active.'},{status:409});
 const body=await request.json().catch(()=>null) as {expectedCount?:unknown;backupSha256?:unknown}|null;
 if(!body||!Number.isSafeInteger(body.expectedCount)||typeof body.backupSha256!=='string'||!/^[a-f0-9]{64}$/.test(body.backupSha256))return Response.json({error:'A verified count and backup checksum are required.'},{status:400});
 try{
  const before=await snapshot();
  if(before.total!==body.expectedCount)return Response.json({error:'Booking count changed since the backup.',before},{status:409});
  const client=await database().connect();
  try{
   await client.query('BEGIN');
   await client.query("SELECT pg_advisory_xact_lock(hashtext('nac_local_booking_cleanup'))");
   const count=await client.query<{total:string}>('SELECT count(*)::text total FROM bookings');
   if(Number(count.rows[0].total)!==before.total){await client.query('ROLLBACK');return Response.json({error:'Booking count changed during cleanup.'},{status:409})}
   const removed=await client.query('DELETE FROM bookings WHERE external_booking_id IS NULL OR NOT (external_booking_id=ANY($1::text[]))',[before.retainedReferences]);
   const remaining=await client.query<{total:string}>('SELECT count(*)::text total FROM bookings');
   if(Number(remaining.rows[0].total)!==before.retainedReferences.length||removed.rowCount!==before.total-before.retainedReferences.length)throw new Error('Cleanup verification failed');
   await client.query('COMMIT');
   return Response.json({deleted:removed.rowCount,remaining:before.retainedReferences.length,retainedReferences:before.retainedReferences,backupSha256:body.backupSha256},{headers:{'Cache-Control':'no-store'}});
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 }catch(error){console.error('Booking cleanup failed',error instanceof Error?error.name:'Unknown');return Response.json({error:'Booking cleanup failed; no committed deletion was confirmed.'},{status:500})}
}
