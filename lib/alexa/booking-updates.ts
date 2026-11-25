import {database,bookingAttemptDatabase} from '../database';
import {hash} from './policy';
/** A spoken preference belongs to one confirmed Autocab booking, not the whole skill. */
export async function setBookingUpdates(principal:string,enabled:boolean,bookingId?:string,services={db:database,attempts:bookingAttemptDatabase}){
 const owner=hash(principal);
 const attempt=(await services.attempts().query<{state:string;external_booking_id:string|null}>("SELECT state,external_booking_id FROM web_booking_attempts WHERE user_id=$1 AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1",['alexa-guest:'+owner])).rows[0];
 if(attempt?.state!=='confirmed'||!attempt.external_booking_id||!/^\d{1,20}$/.test(attempt.external_booking_id)||(bookingId&&bookingId!==attempt.external_booking_id))return {saved:false,permission:false};
 const db=services.db();await db.query(`INSERT INTO alexa_booking_updates(principal,booking_id,opted_in) VALUES($1,$2,$3)
 ON CONFLICT(principal,booking_id) DO UPDATE SET opted_in=EXCLUDED.opted_in,decision_at=now()`,[owner,attempt.external_booking_id,enabled]);
 if(!enabled)await db.query("UPDATE alexa_notification_outbox SET state='omitted',last_error='BOOKING_UPDATES_DECLINED' WHERE principal=$1 AND booking_id=$2 AND state='pending'",[owner,attempt.external_booking_id]);
 const sub=(await db.query<{enabled:boolean}>('SELECT enabled FROM alexa_notification_subscriptions WHERE principal=$1',[owner])).rows[0];
 return {saved:true,permission:sub?.enabled===true};
}
