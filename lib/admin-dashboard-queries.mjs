// Canonical timestamps are UTC without time zone; the reporting day is London-local.
const paymentCountsSql = `jsonb_build_object(
 'total',count(*)::int,
 'cash',count(*) FILTER (WHERE payment='cash')::int,
 'account',count(*) FILTER (WHERE payment='account')::int,
 'card',count(*) FILTER (WHERE payment='card')::int,
 'other',count(*) FILTER (WHERE payment NOT IN ('cash','account','card'))::int)`;
const outcomeSql = (statuses) => `(SELECT ${paymentCountsSql} FROM day_bookings WHERE outcome IN (${statuses.map(s=>`'${s}'`).join(',')}))`;
export const dashboardBookingsSql = `
WITH bounds AS (
 SELECT (($1::date)::timestamp AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC' start_at,
        (($1::date + 1)::timestamp AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC' end_at
), day_bookings AS (
 SELECT upper(replace(replace(trim(COALESCE(status,'')),'-','_'),' ','_')) outcome,
        lower(trim(COALESCE("paymentType",''))) payment,
        (lower(COALESCE("bookingSource",'')) LIKE '%need a cab%'
         OR lower(COALESCE("bookingSource",'')) LIKE '%webapp%'
         OR COALESCE("externalId",'') ~* '^NAC-'
         OR COALESCE("ourReference",'') ~* '^NAC-') webapp
 FROM public."Booking", bounds
 WHERE "pickupDueTime" >= bounds.start_at AND "pickupDueTime" < bounds.end_at
)
SELECT count(*)::int total, count(*) FILTER (WHERE webapp)::int webapp,
 jsonb_build_object(
  'completed',${outcomeSql(['COMPLETED','EXCHANGED_COMPLETED','EXCHANGEDCOMPLETED'])},
  'cancelled',${outcomeSql(['CANCELLED','CANCELED','CANCELLED_CUSTOMER','CANCELLED_DRIVER','CANCELLED_OPERATOR','EXCHANGED_CANCELLED','EXCHANGEDCANCELLED'])},
  'noFare',${outcomeSql(['NO_FARE','NOFARE'])}
 ) outcomes
FROM day_bookings`;

export const dashboardFleetSql = `
WITH latest AS (
 SELECT DISTINCT ON ("currentDriverId") "currentDriverId", lower(trim("currentStatus")) state
 FROM public."Vehicle"
 WHERE "currentDriverId" IS NOT NULL AND "isActive" IS DISTINCT FROM false
 AND "isSuspended" IS DISTINCT FROM true
 AND "lastSeenAt" >= ($1::timestamptz AT TIME ZONE 'UTC') - make_interval(mins => $2)
 AND "lastSeenAt" <= ($1::timestamptz AT TIME ZONE 'UTC') + interval '30 seconds'
 ORDER BY "currentDriverId", "lastSeenAt" DESC
)
SELECT count(*) FILTER (WHERE state IN ('clear','busymeteroff','busymeteroffaccount',
 'busymeteronfromclear','busymeteronfrommeteroffcash','busymeteronfrommeteroffaccount'))::int online,
 count(*) FILTER (WHERE state='clear')::int free,
 count(*) FILTER (WHERE state IN ('busymeteroff','busymeteroffaccount','busymeteronfromclear',
 'busymeteronfrommeteroffcash','busymeteronfrommeteroffaccount'))::int busy
FROM latest`;
