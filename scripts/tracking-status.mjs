import pg from 'pg';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
try{
 const [hooks,positions,vehicles]=await Promise.all([
  pool.query(`SELECT w.event_type,w.event_url_suffix,w.enabled AND p.enabled active,w.received_count,w.last_received_at
   FROM provider_webhooks w JOIN webhook_providers p ON p.id=w.provider_id
   WHERE regexp_replace(lower(w.event_type),'[^a-z]','','g') IN ('vehicletrackschanged','drivershiftstarted','drivershiftended')
   ORDER BY w.event_type`),
  pool.query(`SELECT count(*) FILTER(WHERE received_at>=now()-interval '10 minutes')::int received_10m,
   count(*) FILTER(WHERE received_at>=now()-interval '1 hour')::int received_1h,
   max(received_at) last_received_at,max(recorded_at) last_recorded_at
   FROM driver_positions`),
  pool.query(`SELECT count(*)::int tracked, count(*) FILTER(WHERE lower(vehicle_status)='clear')::int clear,
    count(*) FILTER(WHERE lower(vehicle_status)<>'clear')::int other_statuses
   FROM (SELECT DISTINCT ON (COALESCE(vehicle_id,driver_id)) vehicle_status
    FROM driver_positions WHERE recorded_at>=now()-interval '10 minutes'
    ORDER BY COALESCE(vehicle_id,driver_id),recorded_at DESC,id DESC) latest`),
 ]);
 console.log(JSON.stringify({hooks:hooks.rows,positions:positions.rows[0],vehicles:vehicles.rows[0]}));
}finally{await pool.end()}
