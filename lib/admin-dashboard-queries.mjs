// Canonical timestamps are UTC without time zone; the reporting day is London-local.
export const dashboardBookingsSql = `
WITH bounds AS (
 SELECT (($1::date)::timestamp AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC' start_at,
        (($1::date + 1)::timestamp AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC' end_at
)
SELECT count(*)::int total,
 count(*) FILTER (WHERE lower(COALESCE(source,'')) LIKE '%need a cab%'
 OR lower(COALESCE(source,'')) LIKE '%webapp%'
 OR COALESCE("externalId",'') ~* '^NAC-'
 OR COALESCE("ourReference",'') ~* '^NAC-')::int webapp
FROM public."Booking", bounds
WHERE "pickupDueTime" >= bounds.start_at AND "pickupDueTime" < bounds.end_at`;

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
 'busymeteronfrommeteroffcash','busymeteronfrommeteroffaccount'))::int busy,
 (SELECT count(*)::int FROM public."Vehicle" WHERE "isActive"=true AND "isSuspended" IS DISTINCT FROM true) vehicles
FROM latest`;
