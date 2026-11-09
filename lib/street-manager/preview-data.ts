import type {PoolClient} from 'pg';
import type {Geometry} from 'geojson';
import {streetGeometry,geometryBounds} from './geometry';
import {loadSupplementaryPreview,type SourceCoverage} from './supplementary-view';
import {isPlymouthEvent,PLYMOUTH_SWA_CODE} from './scope';
export type PreviewState='in_progress'|'planned'|'ended'|'restriction'|'unknown';
export type PreviewDetail={label:string;value:string|null;format?:'date'|'datetime'};
export type PreviewItem={id:string;reference:string;workReference:string|null;type:string;title:string;street:string;town:string|null;status:string;state:PreviewState;traffic:string|null;color:string;updatedAt:string;receivedAt:string;geometry:Geometry|null;bounds:[number,number,number,number]|null;warnings:string[];details:PreviewDetail[];source?:'webhook'|'archive'|'council';sourceUrl?:string;locationQuality?:'reported'|'unmapped'|'approximate'|'verified'};
export type PreviewData={checkedAt:string;firstReceipt:string|null;lastReceipt:string|null;receivedEvents:number;totalObjects:number;limited:boolean;items:PreviewItem[];sourceCoverage?:SourceCoverage};
export type PreviewRow={object_type:string;object_reference:string;event_type:string;event_time:Date|string;received_at:Date|string;event_data:{object_data:Record<string,unknown>};same_time_versions?:string|number;object_total?:string|number;source?:'webhook'|'archive'};
function text(data:Record<string,unknown>,key:string):string|null{const v=data[key];return typeof v==='string'&&v.trim()?v.trim().slice(0,3000):typeof v==='number'?String(v):null}
export function previewItem(row:PreviewRow):PreviewItem|null{
 const d=row.event_data.object_data;if(!d||!isPlymouthEvent(d))return null;
 const geometry=streetGeometry(d.works_location_coordinates??d.activity_coordinates??d.section_58_coordinates);
 const status=text(d,'work_status')??text(d,'section_58_status')??text(d,'permit_status')??(text(d,'cancelled')==='Yes'?'Cancelled':null)??'Not provided';
 let state:PreviewState='unknown';
 if(/CANCELLED|REVOKED|REFUSED|CLOSED|WORK_STOP$/.test(row.event_type)||['completed','cancelled','historical'].includes(text(d,'work_status_ref')??'')||['closed','cancelled','revoked','refused'].includes(text(d,'permit_status')??'')||['cancelled','closed'].includes(text(d,'section_58_status')??'')||text(d,'cancelled')==='Yes')state='ended';
 else if(row.object_type==='SECTION_58')state='restriction';
 else if(text(d,'work_status_ref')==='in_progress'||row.event_type==='WORK_START')state='in_progress';
 else if(text(d,'work_status_ref')==='planned'||['PERMIT_GRANTED','PERMIT_ALTERATION_GRANTED','PERMIT_SUBMITTED','ACTIVITY_CREATED','ACTIVITY_UPDATED'].includes(row.event_type))state='planned';
 const warnings:string[]=[];
 if(row.event_type.endsWith('_REVERTED')){state='unknown';warnings.push('A previous work update was reverted. Review the reported status before drawing conclusions.')}
 if(Number(row.same_time_versions)>1){state='unknown';warnings.push('Multiple updates share the latest source timestamp. Their order is uncertain.')}
 if(row.source==='archive'){state='unknown';warnings.push('Historical Street Manager snapshot. Later updates before our webhook activation may be missing. This archive record is excluded from automatic driver alerts.')}
 if(!geometry)warnings.push('Location missing or invalid; this record is listed but cannot be placed on the map.');
 if(row.object_type==='SECTION_58')warnings.push('Section 58 restricts future street works. It does not itself mean the road is closed.');
 const traffic=text(d,'current_traffic_management_type')??text(d,'traffic_management_type');
 const color=state==='ended'?'#8b99a5':state==='unknown'?'#64748b':row.object_type==='SECTION_58'?'#a78bfa':/road.closure/i.test(traffic??'')?'#f87171':'#f5be58';
 const fields:[string,string,('date'|'datetime')?][]=[
  ['Promoter','promoter_organisation'],['Authority','highway_authority'],['Work category','work_category'],['Work / activity type','activity_type'],['Reported work status','work_status'],['Permit status','permit_status'],['Section 58 status','section_58_status'],['Current traffic management','current_traffic_management_type'],['Proposed traffic management','traffic_management_type'],['Proposed start date','proposed_start_date','date'],['Proposed start time','proposed_start_time','datetime'],['Proposed end date','proposed_end_date','date'],['Proposed end time','proposed_end_time','datetime'],['Actual start','actual_start_date_time','datetime'],['Actual end','actual_end_date_time','datetime'],['Activity / restriction start date','start_date','date'],['Activity start time','start_time','datetime'],['Activity / restriction end date','end_date','date'],['Activity end time','end_time','datetime'],['Location description','activity_location_description'],['Location type','works_location_type'],['Activity location type','activity_location_type'],['Footway closure','close_footway'],['Traffic sensitive','is_traffic_sensitive'],['Traffic regulation order required','is_ttro_required'],['Permit conditions','permit_conditions'],['Section 58 duration','section_58_duration'],['Section 58 extent','section_58_extent'],['Street reference (USRN)','usrn']
 ];
 // Only documented public roadworks fields are exposed; no raw SNS envelopes,
 // subscription details, credentials, contact details or arbitrary new fields.
 const details:PreviewDetail[]=fields.filter(([,key])=>text(d,key)!==null||['promoter_organisation','proposed_start_date','proposed_end_date','proposed_start_time','proposed_end_time'].includes(key)).map(([label,key,format])=>({label,value:text(d,key),...(format?{format}:{})}));
 details.unshift({label:'Data source',value:row.source==='archive'?'DfT Street Manager archive':'Street Manager webhook'});
 details.push({label:'Latest source event',value:row.event_type},{label:'Source update (London time)',value:new Date(row.event_time).toISOString(),format:'datetime'},{label:row.source==='archive'?'Imported (London time)':'Received (London time)',value:new Date(row.received_at).toISOString(),format:'datetime'});
 return {id:row.object_type+':'+row.object_reference,reference:row.object_reference,workReference:text(d,'work_reference_number'),type:row.object_type,title:text(d,'activity_name')??text(d,'street_name')??row.object_reference,street:text(d,'street_name')??'Street not provided',town:text(d,'town'),status,state,traffic,color,updatedAt:new Date(row.event_time).toISOString(),receivedAt:new Date(row.received_at).toISOString(),geometry,bounds:geometry?geometryBounds(geometry):null,warnings,details,source:row.source??'webhook',sourceUrl:row.source==='archive'?'https://opendata.manage-roadworks.service.gov.uk/permit/2026/10.zip':undefined,locationQuality:geometry?'reported':'unmapped'};
}
export async function loadStreetPreview(client:Pick<PoolClient,'query'>):Promise<PreviewData>{
 const supplementary=await loadSupplementaryPreview(client),relation=supplementary.archiveView?'street_manager_roadwork_events':'street_manager_events';
 const rows=(await client.query<PreviewRow>(`WITH scoped AS (
  SELECT *,row_number() OVER(PARTITION BY object_type,COALESCE(NULLIF(event_data#>>'{object_data,work_reference_number}',''),object_reference) ORDER BY event_time DESC,received_at DESC,event_reference DESC) AS latest,
  count(*) OVER(PARTITION BY object_type,COALESCE(NULLIF(event_data#>>'{object_data,work_reference_number}',''),object_reference),event_time) AS same_time_versions
  FROM ${relation} WHERE btrim(event_data#>>'{object_data,highway_authority_swa_code}')=$1
 ), current_objects AS (SELECT * FROM scoped WHERE latest=1)
 SELECT *,count(*) OVER() AS object_total FROM current_objects ORDER BY event_time DESC,object_type,object_reference LIMIT 1500`,[PLYMOUTH_SWA_CODE])).rows;
 const summary=(await client.query("SELECT count(*)::int AS total,min(received_at) AS first,max(received_at) AS last FROM street_manager_events WHERE btrim(event_data#>>'{object_data,highway_authority_swa_code}')=$1",[PLYMOUTH_SWA_CODE])).rows[0];
 return {checkedAt:new Date().toISOString(),firstReceipt:summary.first?new Date(summary.first).toISOString():null,lastReceipt:summary.last?new Date(summary.last).toISOString():null,receivedEvents:summary.total,totalObjects:Number(rows[0]?.object_total??0)+supplementary.items.length,limited:Number(rows[0]?.object_total??0)>1500,items:[...rows.map(previewItem).filter((r):r is PreviewItem=>r!==null),...supplementary.items],sourceCoverage:supplementary.coverage};
}
