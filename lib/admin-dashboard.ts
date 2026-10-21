import {database} from '@/lib/database';
import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';
import {bookingPeriod} from '@/lib/booking-period';
import {membershipEntitlement,type MembershipRecord} from '@/lib/membership-entitlement';
import {membershipTierIds,quotePolicySchema} from '@/lib/quote-policy';
import {dashboardBookingsSql,dashboardFleetSql} from '@/lib/admin-dashboard-queries.mjs';

export type OutcomeCount={total:number;cash:number;account:number;card:number;other:number};
export type BookingOutcomes={completed:OutcomeCount;cancelled:OutcomeCount;noFare:OutcomeCount};
export type DashboardSummary = {
 checkedAt:string; day:string; bookings:number|null; webapp:number|null; outcomes:BookingOutcomes|null;
 fleet:{online:number;free:number;busy:number}|null;
 memberships:{active:number;test:number;tiers:{id:string;name:string;active:number;test:number}[]}|null;
 attention:{documents:number|null;setup:number|null};
 connections:{database:boolean;autocab:'live'|'stale'|'unavailable';lastEvent:string|null;payments:'live'|'test'|'disabled'|'incomplete'|'unavailable'};
};
async function localQuery<T extends import('pg').QueryResultRow>(text:string,values:unknown[]=[]){
 const query={text,values,query_timeout:8000};
 return database().query<T>(query);
}
export async function adminDashboardSummary():Promise<DashboardSummary>{
 const now=new Date(),day=bookingPeriod(new URLSearchParams(),now).start!;
 const freshness=Number(process.env.DRIVER_LIVE_FRESHNESS_MINUTES||10);
 const minutes=Number.isFinite(freshness)&&freshness>0?Math.floor(freshness):10;
 const [bookingResult,fleetResult,memberResult,documentResult,paymentResult,eventResult]=await Promise.allSettled([
  withTaxiCrmReadOnly(async c=>(await c.query<{total:number;webapp:number;outcomes:BookingOutcomes}>(dashboardBookingsSql,[day])).rows[0]),
  withTaxiCrmReadOnly(async c=>(await c.query<{online:number;free:number;busy:number}>(dashboardFleetSql,[now.toISOString(),minutes])).rows[0]),
  (async()=>{
   const [members,config]=await Promise.all([
    localQuery<MembershipRecord>('SELECT tier_id,status,starts_at,ends_at,grace_ends_at,operator_access_until FROM customer_memberships'),
    localQuery<{policy:unknown}>("SELECT settings->'liveQuotes' policy FROM operations_settings WHERE id='pricing'")
   ]);
   const policy=quotePolicySchema.parse(config.rows[0]?.policy||{});
   const entitled=members.rows.map(r=>membershipEntitlement(r,policy,now.getTime())).filter(r=>r!==null);
   const tiers=membershipTierIds.map(id=>({id,name:policy.membership.tiers[id].name,active:entitled.filter(r=>r.tierId===id).length,test:entitled.filter(r=>r.tierId===id&&'testAccessUntil' in r).length}));
   return {active:entitled.length,test:entitled.filter(r=>'testAccessUntil' in r).length,tiers};
  })(),
  localQuery<{total:number}>(`SELECT count(*)::int total FROM (
   SELECT d.id FROM local_driver_documents d JOIN local_drivers p ON p.id=d.driver_id WHERE p.status='active' AND d.expires_on <= $1::date+30
   UNION ALL SELECT d.id FROM local_vehicle_documents d JOIN local_vehicles p ON p.id=d.vehicle_id WHERE p.status='active' AND d.expires_on <= $1::date+30
  ) documents`,[day]),
  localQuery<{enabled:boolean;mode:string;has_secret:boolean;has_public:boolean}>(`SELECT COALESCE((settings->>'enabled')::boolean,false) enabled,
   COALESCE(settings->>'mode','test') mode,COALESCE(secrets_encrypted,'')<>'' has_secret,COALESCE(settings->>'publishableKey','')<>'' has_public FROM operations_settings WHERE id='stripe'`),
  withTaxiCrmReadOnly(async c=>(await c.query<{received:Date|string}>(`SELECT to_char("receivedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS')||'Z' received FROM public."WebhookEvent" WHERE provider='AUTOCAB' ORDER BY "receivedAt" DESC LIMIT 1`)).rows[0])
 ]);
 if(bookingResult.status==='rejected')console.error('Admin dashboard booking summary unavailable', {code:typeof bookingResult.reason?.code==='string'?bookingResult.reason.code:'QUERY_FAILED'});
 const payment=paymentResult.status==='fulfilled'?paymentResult.value.rows[0]:null;
 const payments=paymentResult.status==='rejected'?'unavailable':!payment?.enabled?'disabled':(!payment.has_secret||!payment.has_public)?'incomplete':payment.mode==='live'?'live':'test';
 const received=eventResult.status==='fulfilled'?eventResult.value?.received:null;
 const lastEvent=received instanceof Date?received.toISOString():received?new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(received)?received:received+'Z').toISOString():null;
 const eventAge=lastEvent?now.getTime()-new Date(lastEvent).getTime():null;
 return {checkedAt:now.toISOString(),day,
  bookings:bookingResult.status==='fulfilled'?bookingResult.value.total:null,
  webapp:bookingResult.status==='fulfilled'?bookingResult.value.webapp:null,
  outcomes:bookingResult.status==='fulfilled'?bookingResult.value.outcomes:null,
  fleet:fleetResult.status==='fulfilled'?fleetResult.value:null,
  memberships:memberResult.status==='fulfilled'?memberResult.value:null,
  attention:{documents:documentResult.status==='fulfilled'?documentResult.value.rows[0].total:null,setup:payments==='unavailable'?null:payments==='incomplete'?1:0},
  connections:{database:bookingResult.status==='fulfilled',autocab:!lastEvent?'unavailable':eventAge!==null&&eventAge>=-30_000&&eventAge<=5*60_000?'live':'stale',lastEvent,payments}
 };
}
