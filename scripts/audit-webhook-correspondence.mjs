import pg from 'pg';

const local=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const source=new pg.Pool({connectionString:process.env.TAXICRM_DATABASE_URL,connectionTimeoutMillis:5000});
const expectedPaths={BookingCreated:'/booking_created',BookingModified:'/booking_modified',BookingDispatched:'/booking_dispatch',BookingDispatchAccepted:'/booking_accepted',BookingArrived:'/dap',BookingPOB:'/pob',BookingComplete:'/booking_done',BookingCancelled:'/booking_cancelled',BookingNoFare:'/booking_no_fare',BookingRejected:'/booking_rejected',BookingRecovered:'/booking_recovered',BookingRunningLate:'/running_late',DriverShiftStartedEnded:'/driver_shift_start',VehicleTracksChanged:'/tracks_change'};
try{
 const [sourceEvents,sourceSamples,localHooks,localEvents,localBookings,localPositions]=await Promise.all([
  source.query(`SELECT "eventType" event_type,status::text status,count(*)::int count,max("receivedAt") last_received_at
   FROM public."WebhookEvent" WHERE "receivedAt">=now()-interval '24 hours'
   GROUP BY "eventType",status ORDER BY count DESC`),
  source.query(`SELECT "eventType" event_type,"externalBookingId" booking_id,"receivedAt" received_at,
   payload::jsonb AS payload
   FROM public."WebhookEvent" WHERE "receivedAt">=now()-interval '24 hours'
    AND "eventType" LIKE 'Booking%' AND "externalBookingId" IS NOT NULL
   ORDER BY "receivedAt" DESC LIMIT 100`),
  local.query(`SELECT w.event_type,w.event_url_suffix,w.enabled AND p.enabled active,w.received_count,w.last_received_at
   FROM provider_webhooks w JOIN webhook_providers p ON p.id=w.provider_id ORDER BY w.event_type,w.event_url_suffix`),
  local.query(`SELECT event_type,count(*)::int count,max(received_at) last_received_at FROM webhook_events
   WHERE received_at>=now()-interval '24 hours' GROUP BY event_type ORDER BY count DESC`),
  local.query(`SELECT last_event_type,count(*)::int count,max(updated_at) last_updated_at FROM bookings
   WHERE updated_at>=now()-interval '24 hours' AND external_booking_id IS NOT NULL
   GROUP BY last_event_type ORDER BY count DESC`),
  local.query(`SELECT count(*) FILTER(WHERE received_at>=now()-interval '24 hours')::int positions_24h,
   max(received_at) last_received_at,max(recorded_at) last_recorded_at FROM driver_positions`),
 ]);
 const sampleIds=[...new Set(sourceSamples.rows.map(row=>row.booking_id))].slice(0,100);
 const correspondence=sampleIds.length?await local.query(`SELECT external_booking_id,status,last_event_type,updated_at FROM bookings WHERE external_booking_id=ANY($1::text[])`,[sampleIds]):{rows:[]};
 const localById=new Map(correspondence.rows.map(row=>[row.external_booking_id,row]));
 const eventNames=[...new Set(sourceEvents.rows.map(row=>row.event_type))];
 const activePaths=new Set(localHooks.rows.filter(row=>row.active).map(row=>row.event_url_suffix));
 const missingNames=eventNames.filter(name=>!expectedPaths[name]||!activePaths.has(expectedPaths[name]));
 const matched=sampleIds.filter(id=>localById.has(id));
 const unmatched=sampleIds.filter(id=>!localById.has(id));
 const sampleKeys=[...new Set(sourceSamples.rows.flatMap(row=>Object.keys(row.payload||{})))].sort();
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),sourceEvents:sourceEvents.rows,localHooks:localHooks.rows,localFailedEvents:localEvents.rows,localBookings:localBookings.rows,localPositions:localPositions.rows[0],sampleBookingIds:sampleIds.length,matchedBookingIds:matched.length,unmatchedBookingIds:unmatched.length,unmatchedExamples:unmatched.slice(0,8),matchedExamples:matched.slice(0,8).map(id=>({bookingId:id,localStatus:localById.get(id)?.status,lastEvent:localById.get(id)?.last_event_type})),sourceBookingPayloadKeys:sampleKeys,sourceEventsWithoutActiveLocalHook:missingNames},null,2));
}finally{await Promise.all([local.end(),source.end()])}
