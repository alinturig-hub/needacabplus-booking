import type {PoolClient} from 'pg';
export async function streetManagerStatus(client:Pick<PoolClient,'query'>){
 const subscriptions=(await client.query("SELECT split_part(topic_arn,':',6) AS topic,confirmed_at FROM street_manager_subscriptions ORDER BY topic_arn")).rows;
 const events=(await client.query("SELECT count(*)::text AS total,min(received_at) AS first_received,max(received_at) AS last_received,max(event_time) AS latest_source_event,count(*) FILTER(WHERE received_at>=now()-interval '24 hours')::text AS received_last_24h FROM street_manager_events")).rows[0];
 const topics=(await client.query("SELECT split_part(topic_arn,':',6) AS topic,count(*)::text AS total,max(received_at) AS last_received FROM street_manager_events GROUP BY topic_arn ORDER BY topic_arn")).rows;
 return {checkedAt:new Date().toISOString(),state:BigInt(events.total)>0?'receiving':subscriptions.length?'subscribed_no_events':'awaiting_confirmation',subscriptions,events,topics};
}
