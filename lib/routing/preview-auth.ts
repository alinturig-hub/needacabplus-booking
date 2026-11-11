import {timingSafeEqual} from 'node:crypto';
// Existing internal job credential permits read-only route diagnostics only.
export function validRouteJobSecret(request:Request,secret=process.env.BOOKING_WRITER_JOB_SECRET){
 const supplied=request.headers.get('x-booking-writer-secret');
 return Boolean(secret&&supplied&&Buffer.byteLength(secret)===Buffer.byteLength(supplied)&&timingSafeEqual(Buffer.from(secret),Buffer.from(supplied)));
}
