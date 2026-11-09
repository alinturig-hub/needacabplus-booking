import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {alertPolicy,type ClosureCandidate} from './closure-alerts';
export async function claimDriverAlert(client:Pick<PoolClient,'query'>,candidate:ClosureCandidate,now=Date.now()):Promise<string|null>{
 try{
  await client.query('BEGIN');
  const clock=await client.query(`INSERT INTO street_manager_driver_alert_clock(driver_id,last_attempt_at) VALUES($1,$2)
   ON CONFLICT(driver_id) DO UPDATE SET last_attempt_at=EXCLUDED.last_attempt_at
   WHERE street_manager_driver_alert_clock.last_attempt_at<=$2::timestamptz-interval '120 seconds' RETURNING driver_id`,[candidate.driverId,new Date(now)]);
  if(!clock.rows.length){await client.query('ROLLBACK');return null}
  const id=randomUUID();
  const saved=await client.query(`INSERT INTO street_manager_driver_alerts(id,driver_id,vehicle_id,closure_key,alert_day,fix_at,message,distance_metres,status)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,'SENDING') ON CONFLICT(driver_id,closure_key,alert_day) DO NOTHING RETURNING id`,[id,candidate.driverId,candidate.vehicleId,candidate.closureKey,candidate.day,new Date(candidate.fixAt),candidate.message,candidate.distanceMetres]);
  if(!saved.rows.length){await client.query('ROLLBACK');return null}
  await client.query('COMMIT');return id;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
export {alertPolicy};
