import {bookingPeriod} from '@/lib/booking-period';
import {hackneyPeriodPredicate} from '@/lib/hackney-period.mjs';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin} from '@/lib/security';
import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';
import {loadHackneyPolicy} from '@/lib/hackney';
import {hackneyExpressions,validateHackneyPolicy} from '@/lib/hackney-policy.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Forbidden'},{status:403});
 // Older clients without a period continue to receive their all-history view.
 const params=new URL(request.url).searchParams;if(!params.has('period'))params.set('period','all');
 let period;try{period=bookingPeriod(params)}catch(error){return Response.json({error:error instanceof Error?error.message:'Invalid period.'},{status:400})}
 try{
  const policy=await loadHackneyPolicy();
  const summary=await withTaxiCrmReadOnly(async client=>{
   const values:unknown[]=[];const add=(v:unknown)=>{values.push(v);return '$'+values.length};
   const e=hackneyExpressions(policy,add);
   const periodWhere=hackneyPeriodPredicate(period,add);
   const result=await client.query(`SELECT count(*) FILTER(WHERE ${e.hackney})::int hackney,
    count(*) FILTER(WHERE ${e.street})::int street,
    count(*) FILTER(WHERE ${e.hackney} AND ${e.street})::int overlap,
    count(*) FILTER(WHERE ${e.unknown})::int unknown_driver,
    count(*) FILTER(WHERE ${e.hackney} AND ${e.cmac})::int cmac_jobs,
    count(*) FILTER(WHERE ${e.hackney} AND ${e.cmac} AND booking.status='COMPLETED')::int cmac_completed,
    COALESCE(sum(booking.price) FILTER(WHERE ${e.hackney} AND ${e.cmac} AND booking.status='COMPLETED'),0)::text cmac_completed_value,
    count(*) FILTER(WHERE ${e.hackney} AND ${e.cmac} AND booking.status='COMPLETED' AND booking.price IS NULL)::int cmac_missing_price,
    count(*) FILTER(WHERE ${e.hackney} AND ${e.cmac} AND booking.status='COMPLETED' AND booking.price=0)::int cmac_zero_price,
    count(*) FILTER(WHERE ${e.hackney} AND (booking."pickupDueTime" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date=(now() AT TIME ZONE 'Europe/London')::date)::int hackney_today
    FROM public."Booking" booking WHERE ${periodWhere}`,values);
   return result.rows[0];
  });
  return Response.json({policy,summary,period,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Hackney data is temporarily unavailable. Please retry.'},{status:503})}
}
export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Forbidden'},{status:403});
 let policy;try{policy=validateHackneyPolicy(await request.json())}catch(error){return Response.json({error:error instanceof Error?error.message:'Invalid configuration'},{status:400})}
 try{
  await database().query('UPDATE public.hackney_configuration SET settings=$1::jsonb,updated_at=now() WHERE id=true',[JSON.stringify(policy)]);
  return Response.json({policy});
 }catch{return Response.json({error:'Unable to save Hackney configuration.'},{status:503})}
}
