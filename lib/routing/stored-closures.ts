import type {PoolClient} from 'pg';
import {activeRoadEvent} from '../street-manager/closure-alerts';
import type {PreviewRow} from '../street-manager/preview-data';
import {PLYMOUTH_SWA_CODE} from '../street-manager/scope';
import {councilAlert,type CouncilAlertRow} from '../traffic/council-alerts';
import type {RouteClosure} from './closure-aware';
export async function storedClosures(client:Pick<PoolClient,'query'>,now:number){
 const rows=(await client.query<PreviewRow>(`WITH scoped AS (
 SELECT *,row_number() OVER(PARTITION BY object_type,COALESCE(NULLIF(event_data#>>'{object_data,work_reference_number}',''),object_reference) ORDER BY event_time DESC,received_at DESC,event_reference DESC) AS latest,
 count(*) OVER(PARTITION BY object_type,COALESCE(NULLIF(event_data#>>'{object_data,work_reference_number}',''),object_reference),event_time) AS same_time_versions
 FROM street_manager_events WHERE btrim(event_data#>>'{object_data,highway_authority_swa_code}')=$1)
 SELECT * FROM scoped WHERE latest=1 LIMIT 2001`,[PLYMOUTH_SWA_CODE])).rows;
 if(rows.length>2000)throw Error('Source coverage exceeds the preview limit.');
 const events=rows.flatMap(row=>{
  if(new Date(row.event_time).getTime()>now+5000)return [];
  const d=row.event_data.object_data,start=Date.parse(String(d?.start_time||d?.actual_start_date_time||''));
  const event=activeRoadEvent(row,Math.max(now,Number.isFinite(start)?start:now));
  return event&&event.kind==='closure'?[event]:[];
 });
 const run=(await client.query("SELECT status,last_success_at FROM street_manager_source_runs WHERE source='plymouth_council'")).rows[0];
 const councilFresh=run?.status==='ok'&&Number.isFinite(new Date(run.last_success_at).getTime())&&now-new Date(run.last_success_at).getTime()>= -5000&&now-new Date(run.last_success_at).getTime()<12*3600000;
 if(councilFresh){
  const council=(await client.query<CouncilAlertRow>('SELECT id,notice_data,geometry,location_quality,location_basis,source_checked_at FROM street_manager_council_notices WHERE in_current_snapshot')).rows;
  for(const row of council)for(let hour=0;hour<=12;hour++){
   const event=councilAlert(row,now+hour*3600000);
   if(event?.kind==='closure'&&!events.some(e=>e.key===event.key&&e.startsAt===event.startsAt))events.push(event);
  }
 }
 const closures:RouteClosure[]=events.map(e=>({id:e.key,street:e.street,geometry:e.geometry,startsAt:e.startsAt,endsAt:e.endsAt}));
 return {closures,coverage:{streetManager:'stored_webhooks',council:councilFresh?'fresh_verified_only':'unavailable_or_stale',tomtom:'not_available_as_stored_feed'},limitations:['Reported locations use a conservative 30m corridor; nearby parallel roads may be excluded.','Planned permits without a confirmed work start are excluded.','This is a closure-aware static-time preview, not live-speed routing.']};
}
