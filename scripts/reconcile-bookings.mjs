import pg from 'pg';
import {createHash,createDecipheriv} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {readAuditBooking} from './audit-reference.mjs';
import {applyVerifiedStatus} from './reconcile-booking-status.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('sslmode=require')?{rejectUnauthorized:false}:undefined,max:2,connectionTimeoutMillis:10000,query_timeout:15000,statement_timeout:12000});
const lock=await pool.connect();
try{
 while(!(await lock.query('SELECT pg_try_advisory_lock(9282602) AS locked')).rows[0].locked)await delay(10000);
 {
  for(;;){
   try{
   const conn=(await pool.query("SELECT c.* FROM api_connections c JOIN api_endpoints e ON e.connection_id=c.id WHERE c.provider='autocab' AND e.action_key='booking.create' AND e.enabled=true ORDER BY e.created_at DESC LIMIT 1")).rows[0];
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

    const batch=await pool.query(`SELECT id,external_booking_id,original_booking_id,updated_at::text AS version FROM bookings
    WHERE external_booking_id IS NOT NULL AND status NOT IN ('Completed','Cancelled','No Fare')
    AND COALESCE(pricing_data->>'testBooking','false')<>'true'
    AND booking_pickup_local_time(timeline_data,pickup_data)<(now() AT TIME ZONE 'Europe/London')-interval '2 hours'
    AND (status_checked_at IS NULL OR status_checked_at<now()-interval '6 hours')
    ORDER BY status_checked_at ASC NULLS FIRST,booking_pickup_local_time(timeline_data,pickup_data) DESC LIMIT 50`);
    for(const row of batch.rows){
     try{
      const {remote,lookupReference}=await readAuditBooking(row.external_booking_id,row.original_booking_id,headers);
      await applyVerifiedStatus(pool,row,remote,lookupReference);
     }catch(error){
      if(error.message?.startsWith('STOP_'))throw error;
      await pool.query('UPDATE bookings SET status_checked_at=now(),status_check_result=$3::jsonb WHERE id=$1 AND updated_at=$2',[row.id,row.version,JSON.stringify({status:'unresolved',error:/^(HTTP_[0-9]+|TIMEOUT|REFERENCE_MISMATCH)$/.test(error.message)?error.message:'LOOKUP_FAILED'})]);
     }
     await delay(1000);
    }
    if(!batch.rowCount)await delay(60000);
   }catch{console.error('Final booking status synchronization paused; retrying in five minutes.');await delay(300000)}
  }
 }
}finally{lock.release();await pool.end()}
