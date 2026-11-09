import type {PoolClient} from 'pg';
import type {Geometry} from 'geojson';
import {geometryBounds} from './geometry';
import type {CouncilNotice} from './council';
import type {PreviewItem} from './preview-data';
export type SourceCoverage={archive:{count:number;importedAt:string|null;sourceUrl:string|null;period:string|null};council:{count:number;lastCheckedAt:string|null;lastSuccessAt:string|null;status:string;stale:boolean;errorCode:string|null;sourceUrl:string}};
type CouncilRow={id:string;notice_data:CouncilNotice;geometry:Geometry|null;location_quality:'unmapped'|'approximate'|'verified';location_basis:string|null;source_checked_at:Date|string};
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
export function councilPreviewItem(row:CouncilRow,now=Date.now()):PreviewItem{
 const n=row.notice_data,day=dayFormat.format(now),state=n.startDate>day?'planned':n.endDate<day?'ended':'unknown';
 const warnings=['Council publication: dates and traffic management are reported information, not a live confirmation of the road condition. This source is excluded from automatic driver alerts.'];
 if(!row.geometry)warnings.push('Location pending review. This notice is listed but is not placed on the map.');
 else if(row.location_quality!=='verified')warnings.push('Approximate '+(row.location_basis==='junction'?'junction':'street')+' position from OpenStreetMap. Verify the affected segment before operational use.');
 return {id:'COUNCIL:'+n.id,reference:n.id,type:'COUNCIL',workReference:null,title:n.street,street:n.street,town:'Plymouth',status:state==='planned'?'Council: scheduled':state==='ended'?'Council: published period ended':'Council: within published dates; condition unverified',state,traffic:n.traffic,color:state==='ended'?'#8b99a5':'#6ac4ce',updatedAt:new Date(row.source_checked_at).toISOString(),receivedAt:new Date(row.source_checked_at).toISOString(),geometry:row.geometry,bounds:row.geometry?geometryBounds(row.geometry):null,warnings,source:'council',sourceUrl:n.sourceUrl,locationQuality:row.location_quality,details:[{label:'Source',value:'Plymouth City Council'},{label:'Published start date',value:n.startDate,format:'date'},{label:'Published end date',value:n.endDate,format:'date'},{label:'Published date description',value:n.dateText},{label:'Reported traffic management / hours',value:n.traffic},{label:'Reported details',value:n.description},{label:'Contractor',value:n.contractor},{label:'Source checked (London time)',value:new Date(row.source_checked_at).toISOString(),format:'datetime'},{label:'Position quality',value:row.location_quality==='unmapped'?'Pending review':row.location_quality==='verified'?'Verified':'Approximate '+(row.location_basis??'street')+' location · not verified for alerts'}]};
}
export async function loadSupplementaryPreview(client:Pick<PoolClient,'query'>,now=Date.now()):Promise<{archiveView:boolean;items:PreviewItem[];coverage?:SourceCoverage}>{
 const ready=(await client.query("SELECT to_regclass('public.street_manager_roadwork_events') IS NOT NULL AS archive_view,to_regclass('public.street_manager_council_notices') IS NOT NULL AS council_ready,to_regclass('public.street_manager_source_runs') IS NOT NULL AS runs_ready")).rows[0];
 if(!ready.archive_view||!ready.council_ready||!ready.runs_ready)return {archiveView:false,items:[]};
 const rows=(await client.query<CouncilRow>('SELECT id,notice_data,geometry,location_quality,location_basis,source_checked_at FROM street_manager_council_notices WHERE in_current_snapshot ORDER BY notice_data->>\'startDate\',id')).rows;
 const archive=(await client.query('SELECT count(*)::int AS count,max(imported_at) AS imported_at,min(source_url) AS source_url FROM street_manager_archive_events')).rows[0];
 const runs=(await client.query('SELECT source,checked_at,last_success_at,status,error_code,item_count,details FROM street_manager_source_runs')).rows;
 const council=runs.find(r=>r.source==='plymouth_council'),backfill=runs.find(r=>r.source==='dft_archive_2026_10');
 return {archiveView:true,items:rows.map(row=>councilPreviewItem(row,now)),coverage:{archive:{count:archive.count,importedAt:archive.imported_at?new Date(archive.imported_at).toISOString():null,sourceUrl:archive.source_url,period:backfill?.details?.period??null},council:{count:rows.length,lastCheckedAt:council?.checked_at?new Date(council.checked_at).toISOString():null,lastSuccessAt:council?.last_success_at?new Date(council.last_success_at).toISOString():null,status:council?.status??'not_imported',stale:!council?.last_success_at||now-new Date(council.last_success_at).getTime()>12*3600000||council?.status!=='ok',errorCode:council?.error_code??null,sourceUrl:'https://www.plymouth.gov.uk/roadworks'}}};
}
