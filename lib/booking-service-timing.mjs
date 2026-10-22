// One SQL implementation, shared by the server reader and hand-calculated fixtures.
export function timingPolicy(env=process.env){
 const asap=Number(env.BOOKING_ASAP_ON_TIME_MINUTES??10),severe=Number(env.BOOKING_ASAP_SEVERE_MINUTES??15);
 if(!Number.isFinite(asap)||!Number.isFinite(severe)||asap<=0||severe<=asap||severe>180)throw Error('Invalid booking punctuality thresholds');
 return {asap,severe};
}
export const bookingServiceTimingSql=`
WITH input AS (
 SELECT *,COALESCE($2::timestamptz,CURRENT_TIMESTAMP) assessed_at
 FROM jsonb_to_recordset($1::jsonb) AS x(id text,b jsonb,t jsonb,raw jsonb)
),facts AS (
 SELECT *,lower(regexp_replace(COALESCE(NULLIF(b->>'typeOfBooking',''),raw->>'typeOfBooking',raw->>'TypeOfBooking',raw->>'booking_type',raw->>'bookingType',''),'[^a-zA-Z]','','g')) service,
 NULLIF(t->>'bookedAt','')::timestamptz booked,
 NULLIF(t->>'scheduledAt','')::timestamptz scheduled,
 NULLIF(t->>'arrivedAt','')::timestamptz dap,
 NULLIF(t->>'onBoardAt','')::timestamptz onboard,
 NULLIF(t->>'dispatchedAt','')::timestamptz dispatched,
 NULLIF(t->>'acceptedAt','')::timestamptz accepted,
 NULLIF(t->>'estimatedPickupAt','')::timestamptz pickup_eta,
 NULLIF(t->>'dropOffDueAt','')::timestamptz supplied_dropoff,
 CASE WHEN b->>'estimatedTime' ~ '^[0-9]{1,2}:[0-5][0-9]:[0-5][0-9](\\.[0-9]+)?$' THEN (b->>'estimatedTime')::interval END journey
 FROM input
),classified AS (
 SELECT *,CASE WHEN service IN ('asap','priority','now') THEN 'ASAP' WHEN service IN ('advanced','prebook','prebooked','scheduled','guarantee') THEN 'PREBOOK' ELSE 'UNKNOWN' END service_type
 FROM facts
),deadlines AS (
 SELECT *,CASE WHEN service_type='ASAP' THEN booked+make_interval(secs=>($3::numeric*60)::double precision) WHEN service_type='PREBOOK' THEN scheduled-interval '1 minute' END deadline,
 CASE WHEN service_type='PREBOOK' THEN scheduled-interval '5 minutes' END target_start,
 COALESCE(onboard,pickup_eta,CASE WHEN service_type='PREBOOK' THEN scheduled END) estimated_start
 FROM classified
),evaluated AS (
 SELECT *,CASE
 WHEN upper(COALESCE(b->>'status','')) IN ('CANCELLED','NO_FARE','NOFARE','REJECTED','ARCHIVED_NO_JOB') THEN 'NOT_ASSESSED'
 WHEN service_type='UNKNOWN' OR deadline IS NULL THEN 'UNKNOWN'
 WHEN dap IS NOT NULL AND ((booked IS NOT NULL AND dap<booked) OR onboard<dap OR NULLIF(t->>'completedAt','')::timestamptz<dap) THEN 'INVALID_TIMELINE'
 WHEN dap IS NULL AND (onboard IS NOT NULL OR NULLIF(t->>'completedAt','') IS NOT NULL OR upper(COALESCE(b->>'status','')) IN ('COMPLETED','POB','PASSENGER_ON_BOARD','ARCHIVED_REVIEW')) THEN 'UNKNOWN'
 WHEN dap IS NULL AND assessed_at>deadline THEN 'OVERDUE_UNCONFIRMED'
 WHEN dap IS NULL THEN 'AWAITING_DAP'
 WHEN service_type='PREBOOK' AND dap<target_start THEN 'EARLY'
 WHEN dap<=deadline THEN 'ON_TIME'
 WHEN service_type='ASAP' AND dap>booked+make_interval(secs=>($4::numeric*60)::double precision) THEN 'SEVERELY_LATE'
 ELSE 'LATE' END assessment,
 COALESCE(supplied_dropoff,CASE WHEN journey>interval '0' AND estimated_start IS NOT NULL THEN estimated_start+journey END) estimated_dropoff
 FROM deadlines
)
SELECT id,jsonb_build_object(
 'serviceType',service_type,'assessment',assessment,'assessedAt',assessed_at,
 'rule',CASE WHEN service_type='ASAP' THEN 'ASAP: DAP within '||$3::text||' min of booking; severe after '||$4::text||' min' WHEN service_type='PREBOOK' THEN 'Pre-book: target 5–1 min before pickup; latest DAP 1 min before pickup' ELSE 'Booking service type not supplied' END,
 'targetStart',target_start,'deadline',deadline,'dapAt',dap,
 'bookingToDapMinutes',CASE WHEN dap>=booked THEN round((extract(epoch FROM dap-booked)/60)::numeric,1) END,
 'lateMinutes',CASE WHEN dap>deadline THEN round((extract(epoch FROM dap-deadline)/60)::numeric,1) END,
 'dispatchDelayMinutes',CASE WHEN dispatched>=booked THEN round((extract(epoch FROM dispatched-booked)/60)::numeric,1) END,
 'dispatchToDapMinutes',CASE WHEN dap>=dispatched THEN round((extract(epoch FROM dap-dispatched)/60)::numeric,1) END,
 'acceptanceToDapMinutes',CASE WHEN dap>=accepted THEN round((extract(epoch FROM dap-accepted)/60)::numeric,1) END,
 'dapToOnboardMinutes',CASE WHEN onboard>=dap THEN round((extract(epoch FROM onboard-dap)/60)::numeric,1) END,
 'estimatedDropoffAt',estimated_dropoff,
 'dropoffBasis',CASE WHEN supplied_dropoff IS NOT NULL THEN 'Autocab supplied drop-off time' WHEN estimated_dropoff IS NOT NULL AND onboard IS NOT NULL THEN 'Computed: recorded on-board time + estimated journey duration' WHEN estimated_dropoff IS NOT NULL AND pickup_eta IS NOT NULL THEN 'Computed: saved pickup ETA + estimated journey duration' WHEN estimated_dropoff IS NOT NULL AND service_type='PREBOOK' AND scheduled IS NOT NULL THEN 'Computed: scheduled pickup + estimated journey duration' WHEN estimated_dropoff IS NOT NULL THEN 'Computed: recorded on-board time + estimated journey duration' ELSE 'No drop-off time or usable journey estimate supplied' END,
 'recordedCompletionAt',t->>'completedAt',
 'attribution','Service punctuality only; phase timings do not establish driver fault. No automatic penalties or allocation changes.'
) service_timing FROM evaluated`;
