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
 const callsign=process.argv[2];
 if(callsign){
  if(!/^\d{1,6}$/.test(callsign))throw new Error('A numeric vehicle callsign is required');
  const local=await pool.query(`SELECT vehicle_id,vehicle_callsign,latitude,longitude,vehicle_status,recorded_at,received_at
   FROM driver_positions WHERE vehicle_callsign=$1 OR vehicle_id=$1 ORDER BY recorded_at DESC LIMIT 12`,[callsign]);
  let taxiCrm=null;
  if(process.env.TAXICRM_DATABASE_URL){
   const source=new pg.Pool({connectionString:process.env.TAXICRM_DATABASE_URL,connectionTimeoutMillis:5000});
   try{
    const result=await source.query(`SELECT "externalId" vehicle_id,callsign,"currentLatitude" latitude,"currentLongitude" longitude,
     "currentStatus" vehicle_status,"lastSeenAt" recorded_at FROM public."Vehicle"
     WHERE callsign=$1 OR "externalId"=$1 ORDER BY "lastSeenAt" DESC LIMIT 5`,[callsign]);
    taxiCrm=result.rows;
   }finally{await source.end()}
  }
  console.log(JSON.stringify({callsign,local:local.rows,taxiCrm}));
 }
}finally{await pool.end()}
