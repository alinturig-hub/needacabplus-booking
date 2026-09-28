import pg from 'pg';
import {createHash,createDecipheriv} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {compareBooking} from './compare-booking.mjs';
import {readAuditBooking} from './audit-reference.mjs';
const auditId='booking-modified-review-2026-09-28-v1';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('sslmode=require')?{rejectUnauthorized:false}:undefined,max:2,connectionTimeoutMillis:10000,query_timeout:15000,statement_timeout:12000});
const db=await pool.connect();
let heartbeat;
try{
 if(!(await db.query('SELECT pg_try_advisory_lock(9282601) AS locked')).rows[0].locked)process.exitCode=0;
 else{
  heartbeat=setInterval(()=>{pool.query('UPDATE booking_database_audits SET heartbeat_at=now() WHERE id=$1 AND finished_at IS NULL',[auditId]).catch(()=>{})},10000);
  await db.query('BEGIN');
  const created=await db.query('INSERT INTO booking_database_audits(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[auditId]);
  if(created.rowCount){
   await db.query(`INSERT INTO booking_database_audit_items(audit_id,booking_id,reference,local_snapshot,local_version)
    SELECT $1,id,external_booking_id,jsonb_build_object('status',status,'timeline_data',timeline_data,'driver_data',jsonb_build_object('id',COALESCE(driver_data->>'id',driver_data->>'Id')),'vehicle_data',jsonb_build_object('id',COALESCE(vehicle_data->>'id',vehicle_data->>'Id')),'fare_pence',fare_pence,'passengers',passengers,'dispatch_requirements',dispatch_requirements,'pickup_data',jsonb_build_object('latitude',pickup_data->'latitude','longitude',pickup_data->'longitude'),'destination_data',jsonb_build_object('latitude',destination_data->'latitude','longitude',destination_data->'longitude'),'vias_data',CASE WHEN jsonb_typeof(vias_data)='array' THEN (SELECT COALESCE(jsonb_agg(0),'[]'::jsonb) FROM jsonb_array_elements(vias_data)) ELSE NULL END),updated_at::text
    FROM bookings WHERE external_booking_id IS NOT NULL AND COALESCE(pricing_data->>'testBooking','false')<>'true'`,[auditId]);
   await db.query('UPDATE booking_database_audits SET total=(SELECT count(*) FROM booking_database_audit_items WHERE audit_id=$1) WHERE id=$1',[auditId]);
  }
  await db.query('COMMIT');
  const retryLegacy=await db.query("UPDATE booking_database_audit_items SET checked_at=NULL,result=jsonb_build_object('legacyRetry',true) WHERE audit_id=$1 AND result->>'error'='Comparison unavailable'",[auditId]);
  const retryOriginal=await db.query(`UPDATE booking_database_audit_items i SET checked_at=NULL,result=jsonb_build_object('originalRetryPending',true)
   FROM bookings b WHERE i.audit_id=$1 AND b.id=i.booking_id AND i.result->>'error'='HTTP_404'
   AND b.original_booking_id ~ '^[1-9][0-9]*$' AND b.original_booking_id<>i.reference
   AND (i.result->>'originalReferenceAttempted') IS DISTINCT FROM b.original_booking_id`,[auditId]);
  if(retryLegacy.rowCount||retryOriginal.rowCount)await db.query("UPDATE booking_database_audits SET finished_at=NULL,status='running' WHERE id=$1",[auditId]);
  const run=(await db.query('SELECT * FROM booking_database_audits WHERE id=$1',[auditId])).rows[0];
  if(!run.finished_at){
   const conn=(await db.query("SELECT c.* FROM api_connections c JOIN api_endpoints e ON e.connection_id=c.id WHERE c.provider='autocab' AND e.action_key='booking.create' AND e.enabled=true ORDER BY e.created_at DESC LIMIT 1")).rows[0];
   if(!conn||new URL(conn.base_url).hostname!=='autocab-api.azure-api.net'||new URL(conn.base_url).protocol!=='https:')throw new Error('Direct Autocab booking connection unavailable');
   const secret=process.env.CREDENTIALS_ENCRYPTION_KEY||process.env.ADMIN_SESSION_SECRET;
   if(!secret||secret.length<32)throw new Error('Credential decryption is unavailable');
   const [iv,tag,encrypted]=conn.credentials_encrypted.split('.');
   const cipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(iv,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));
   const credential=JSON.parse(Buffer.concat([cipher.update(Buffer.from(encrypted,'base64url')),cipher.final()]).toString());
   const headers={Accept:'application/json'};
   if(conn.auth_type==='api_key')headers[conn.api_key_header]=credential.token;
   else if(conn.auth_type==='bearer')headers.Authorization=`Bearer ${credential.token}`;
   else throw new Error('Audit requires API key or bearer authentication');
   await db.query("UPDATE booking_database_audits SET status='running',error=NULL,heartbeat_at=now() WHERE id=$1",[auditId]);
   let done=0;
   for(;;){
    const batch=await db.query('SELECT i.*,b.original_booking_id FROM booking_database_audit_items i LEFT JOIN bookings b ON b.id=i.booking_id WHERE i.audit_id=$1 AND i.checked_at IS NULL ORDER BY i.booking_id LIMIT 50',[auditId]);
    if(!batch.rowCount)break;
    for(const row of batch.rows){
     let result;
     try{
      if(!/^\d+$/.test(row.reference))throw new Error('Invalid reference');
      const {remote,...lookup}=await readAuditBooking(row.reference,row.original_booking_id,headers);
      result=compareBooking(row.local_snapshot,remote);
      Object.assign(result,lookup);
      const current=(await db.query('SELECT updated_at::text AS version FROM bookings WHERE id=$1',[row.booking_id])).rows[0];
      result.localChangedSinceSnapshot=current?.version!==row.local_version;
     }catch(error){if(error.message.startsWith('STOP_HTTP_'))throw error;result={error:/^(HTTP_\d+|TIMEOUT|NETWORK_ERROR|INVALID_JSON|INVALID_PAYLOAD|RETRIES_EXHAUSTED|REFERENCE_MISMATCH)$/.test(error.message)?error.message:'LOCAL_COMPARISON_ERROR',originalReferenceAttempted:error.originalReferenceAttempted,differences:[],unverified:['all']}}
     await db.query('UPDATE booking_database_audit_items SET result=$3::jsonb,checked_at=now() WHERE audit_id=$1 AND booking_id=$2',[auditId,row.booking_id,JSON.stringify(result)]);
     done++;if(done%25===0)console.log(`Booking database audit: ${done} checked in this process; snapshot total ${run.total}.`);
     await delay(400);
    }
   }
   await db.query("UPDATE booking_database_audits SET status='finished',finished_at=now() WHERE id=$1",[auditId]);
   const summary=(await db.query("SELECT count(*) AS checked,count(*) FILTER(WHERE result ? 'error') AS errors,count(*) FILTER(WHERE jsonb_array_length(result->'differences')>0) AS mismatches FROM booking_database_audit_items WHERE audit_id=$1",[auditId])).rows[0];
   console.log('Booking database audit finished:',JSON.stringify(summary));
  }
 }
}catch(error){
 await db.query('ROLLBACK').catch(()=>{});
 await db.query("UPDATE booking_database_audits SET status='blocked',error=$2 WHERE id=$1",[auditId,error.message.startsWith('STOP_HTTP_')?error.message:'Audit could not continue; check connection configuration']).catch(()=>{});
 console.error('Booking database audit paused. See booking_database_audits.');process.exitCode=1;
}finally{clearInterval(heartbeat);db.release();await pool.end()}
