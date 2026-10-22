import {database} from '@/lib/database';
import {isAdmin,sameOrigin} from '@/lib/security';
import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';
import {loadHackneyPolicy} from '@/lib/hackney';
import {hackneyExpressions,validateHackneyPolicy} from '@/lib/hackney-policy.mjs';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Forbidden'},{status:403});
 try{
  const policy=await loadHackneyPolicy();
  const summary=await withTaxiCrmReadOnly(async client=>{
   const values:unknown[]=[];const add=(v:unknown)=>{values.push(v);return '$'+values.length};
   const e=hackneyExpressions(policy,add);
   const result=await client.query(`SELECT count(*) FILTER(WHERE ${e.hackney})::int hackney,
    count(*) FILTER(WHERE ${e.street})::int street,
    count(*) FILTER(WHERE ${e.hackney} AND ${e.street})::int overlap,
    count(*) FILTER(WHERE ${e.unknown})::int unknown_driver,
    count(*) FILTER(WHERE ${e.hackney} AND (booking."pickupDueTime" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date=(now() AT TIME ZONE 'Europe/London')::date)::int hackney_today
    FROM public."Booking" booking`,values);
   return result.rows[0];
  });
  return Response.json({policy,summary,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
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
