import {withTaxiCrmReadOnly} from '../taxicrm-database';
import {bookingAttemptDatabase,database} from '../database';
import type {Booking,Field} from './model';
export type CanonicalRow={externalId:string;customerName:string|null;pickupDueTime:Date|string|null;driverForename:string|null;vehicleRegistration:string|null;cancelledAt:Date|string|null;status:string;acceptedAt:Date|string|null;ourReference:string|null;bookingSource:string|null;pickup:string|null;destination:string|null};
type Readers={booking:(id:string)=>Promise<CanonicalRow|undefined>;attempts:(id:string)=>Promise<{user_id:string}[]>;account:(id:string)=>Promise<{id:string}|undefined>};
/** Read-only adapter to the existing canonical Booking, NOT another ingest or copy.
 * No public route invokes this in stage one. Links intentionally absent until a secure issuer exists.
 */
export async function canonicalNotificationBooking(externalId:string,event:'booking.confirmed'|'driver.dispatched',readers?:Readers):Promise<Booking|null>{
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(externalId))throw Error('INVALID_BOOKING_ID');
 const row=readers?await readers.booking(externalId):await withTaxiCrmReadOnly(async db=>(await db.query<CanonicalRow>(`SELECT b."externalId",b."customerName",b."pickupDueTime",b."driverForename",b."vehicleRegistration",b."cancelledAt",b.status,b."acceptedAt",b."ourReference",b."bookingSource",
 (SELECT address FROM public."BookingLocation" WHERE "bookingId"=b.id AND type::text='PICKUP' ORDER BY id LIMIT 1) pickup,
 (SELECT address FROM public."BookingLocation" WHERE "bookingId"=b.id AND type::text='DESTINATION' ORDER BY id LIMIT 1) destination
 FROM public."Booking" b WHERE b.provider='AUTOCAB' AND b."externalId"=$1`,[externalId])).rows[0]);if(!row)return null;
 const attempts=readers?await readers.attempts(externalId):(await bookingAttemptDatabase().query('SELECT user_id FROM web_booking_attempts WHERE external_booking_id=$1 AND state=\'confirmed\' LIMIT 2',[externalId])).rows;
 if(attempts.length>1)throw Error('AMBIGUOUS_BOOKING_ACCOUNT');
 const userId=attempts[0]?.user_id as string|undefined;
 const account=userId&&!userId.startsWith('guest:')?(readers?await readers.account(userId):(await database().query('SELECT id FROM customer_accounts WHERE id=$1',[userId])).rows[0]):null;
 const isWeb=Boolean(userId)||/^NAC-[0-9a-f-]{36}$/i.test(row.ourReference||'')||/webapp/i.test(row.bookingSource||'');
 const fields:Partial<Record<Field,string>>={booking_id:row.externalId};for(const [key,value] of Object.entries({customer_name:row.customerName,pickup_address:row.pickup,dropoff_address:row.destination,pickup_time:row.pickupDueTime?new Date(row.pickupDueTime).toISOString():null,driver_name:row.driverForename,vehicle_registration:row.vehicleRegistration}))if(typeof value==='string'&&value.trim())fields[key as Field]=value;
 return {id:row.externalId,revision:event==='booking.confirmed'?1:row.acceptedAt?new Date(row.acceptedAt).getTime():0,source:isWeb?'webapp':'other',appAccountId:account?.id||null,accountLinkVerified:!isWeb||Boolean(account)||Boolean(userId?.startsWith('guest:')),cancelled:Boolean(row.cancelledAt)||['CANCELLED','CANCELED','REJECTED','NOFARE','NOSHOW'].includes(row.status.toUpperCase().replace(/[^A-Z]/g,'')),fields};
}
