import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import type {PoolClient} from 'pg';
import {eventSchema,boundedText} from './sns';
import {isPlymouthEvent} from './scope';
import {parseCouncilNotices,councilSourceUrl,councilUserAgent} from './council';
import {fetchCouncilLocations,type CouncilLocation} from './council-location';
const archiveUrl='https://opendata.manage-roadworks.service.gov.uk/permit/2026/10.zip';
export async function importPlymouthArchive(client:Pick<PoolClient,'query'>){
 const compressed=await readFile(join(process.cwd(),'data/street-manager/plymouth-archive-2026-10.json.gz'));
 if(compressed.length>2000000)throw Error('ARCHIVE_SEED_TOO_LARGE');
 const hash=createHash('sha256').update(compressed).digest('hex');
 const previous=(await client.query("SELECT content_hash,item_count FROM street_manager_source_runs WHERE source='dft_archive_2026_10'")).rows[0];
 if(previous?.content_hash===hash)return {imported:0,total:previous.item_count};
 const seed=JSON.parse(gunzipSync(compressed,{maxOutputLength:15000000}).toString('utf8')) as {source_url:string;archive_sha256:string;as_of:string;events:unknown[]};
 if(seed.source_url!==archiveUrl||!Array.isArray(seed.events)||seed.events.length>3000||!/^[a-f0-9]{64}$/.test(seed.archive_sha256))throw Error('INVALID_ARCHIVE_SEED');
 const events=seed.events.map(e=>eventSchema.parse(e));
 if(events.some(e=>!isPlymouthEvent(e.object_data)))throw Error('ARCHIVE_OUTSIDE_PLYMOUTH');
 try{
  await client.query('BEGIN');
  await client.query(`INSERT INTO street_manager_archive_events(object_type,event_reference,object_reference,event_type,event_time,event_data,source_url,source_sha256)
   SELECT item->>'object_type',item->>'event_reference',item->>'object_reference',item->>'event_type',(item->>'event_time')::timestamptz,item,$2,$3 FROM jsonb_array_elements($1::jsonb) item
   ON CONFLICT(object_type,event_reference) DO NOTHING`,[JSON.stringify(events),archiveUrl,seed.archive_sha256]);
  await client.query(`INSERT INTO street_manager_source_runs(source,last_success_at,status,item_count,content_hash,source_url,details) VALUES('dft_archive_2026_10',now(),'ok',$1,$2,$3,$4)
   ON CONFLICT(source) DO UPDATE SET checked_at=now(),last_success_at=now(),status='ok',item_count=EXCLUDED.item_count,content_hash=EXCLUDED.content_hash,error_code=NULL,details=EXCLUDED.details`,[events.length,hash,archiveUrl,JSON.stringify({period:'2026-10',seedAsOf:seed.as_of,coverage:'October snapshots; later pre-subscription changes may be missing. Not an automatic-alert source.'})]);
  await client.query('COMMIT');return {imported:events.length,total:events.length};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
}
export async function syncPlymouthCouncil(client:Pick<PoolClient,'query'>,snapshot?:{html:string;fetchedAt:string}){
 const previous=(await client.query("SELECT last_success_at,checked_at,status,item_count,error_code,details FROM street_manager_source_runs WHERE source='plymouth_council'")).rows[0];
 if(!snapshot&&previous?.last_success_at&&Date.now()-new Date(previous.last_success_at).getTime()<6*3600000)return {status:'not_due',notices:previous.item_count};
 if(!snapshot&&previous?.status==='error'&&Date.now()-new Date(previous.checked_at).getTime()<15*60000)return {status:'backoff',notices:previous.item_count};
 try{
  let html=snapshot?.html;
  if(snapshot&&(!Number.isFinite(Date.parse(snapshot.fetchedAt))||Date.now()-Date.parse(snapshot.fetchedAt)>300000||Date.parse(snapshot.fetchedAt)>Date.now()+5000))throw Error('COUNCIL_SNAPSHOT_EXPIRED');
  if(!snapshot){const response=await fetch(councilSourceUrl,{headers:{Accept:'text/html','User-Agent':councilUserAgent},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('COUNCIL_HTTP_'+response.status);html=await boundedText(response,1500000);}
  const notices=parseCouncilNotices(html||'');
  if(previous?.item_count&&notices.length<previous.item_count*.5)throw Error('COUNCIL_COUNT_DROP_REVIEW_REQUIRED');
  const existing=(await client.query('SELECT id,geometry,location_quality,location_basis,location_source,location_checked_at FROM street_manager_council_notices')).rows;
  const verifiedIds=new Set(existing.filter(r=>r.location_quality==='verified').map(r=>r.id));
  let cached:Record<string,CouncilLocation>={};try{cached=JSON.parse(await readFile(join(process.cwd(),'data/street-manager/council-locations.json'),'utf8'))}catch{}
  const missing=notices.filter(n=>!verifiedIds.has(n.id)&&cached[n.id]?.quality!=='verified');
  const fresh=await fetchCouncilLocations(missing),locations={...cached,...fresh};
  const prepared=notices.map(n=>{const previous=existing.find(e=>e.id===n.id);const location=locations[n.id],upgrade=previous?.location_quality!=='verified'&&location?.quality==='verified';return {id:n.id,notice_data:n,geometry:upgrade?location.geometry:previous?.geometry??location?.geometry??null,location_quality:upgrade?location.quality:previous?.location_quality??location?.quality??'unmapped',location_basis:upgrade?location.basis:previous?.location_basis??location?.basis??null,location_source:upgrade?location.source:previous?.location_source??location?.source??null,location_checked_at:upgrade?location.checkedAt:previous?.location_checked_at??location?.checkedAt??null}});
  const hash=createHash('sha256').update(JSON.stringify(notices.map(n=>[n.id,n.contentHash]).sort())).digest('hex');
  await client.query('BEGIN');
  await client.query('UPDATE street_manager_council_notices SET in_current_snapshot=false WHERE in_current_snapshot');
  await client.query(`INSERT INTO street_manager_council_notices(id,notice_data,geometry,location_quality,location_basis,location_source,location_checked_at)
   SELECT id,notice_data,geometry,location_quality,location_basis,location_source,location_checked_at FROM jsonb_to_recordset($1::jsonb) AS x(id text,notice_data jsonb,geometry jsonb,location_quality text,location_basis text,location_source text,location_checked_at timestamptz)
   ON CONFLICT(id) DO UPDATE SET notice_data=EXCLUDED.notice_data,in_current_snapshot=true,last_listed_at=now(),source_checked_at=now(),geometry=EXCLUDED.geometry,location_quality=EXCLUDED.location_quality,location_basis=EXCLUDED.location_basis,location_source=EXCLUDED.location_source,location_checked_at=EXCLUDED.location_checked_at`,[JSON.stringify(prepared)]);
  const details={transport:snapshot?'operator_snapshot':'direct',fetchedAt:snapshot?.fetchedAt||new Date().toISOString(),pageSha256:createHash('sha256').update(html||'').digest('hex'),directFetchError:snapshot?(previous?.error_code||previous?.details?.directFetchError||null):null};
  await client.query(`INSERT INTO street_manager_source_runs(source,last_success_at,status,item_count,content_hash,source_url,details) VALUES('plymouth_council',now(),'ok',$1,$2,$3,$4)
   ON CONFLICT(source) DO UPDATE SET checked_at=now(),last_success_at=now(),status='ok',item_count=EXCLUDED.item_count,content_hash=EXCLUDED.content_hash,error_code=NULL,details=EXCLUDED.details`,[notices.length,hash,councilSourceUrl,JSON.stringify(details)]);
  await client.query('COMMIT');return {status:'ok',transport:details.transport,notices:notices.length,verified:prepared.filter(n=>n.location_quality==='verified').length,mapped:prepared.filter(n=>n.geometry).length,unmapped:prepared.filter(n=>!n.geometry).length};
 }catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  const code=error instanceof Error&&/^COUNCIL_[A-Z0-9_]+$/.test(error.message)?error.message:'COUNCIL_SYNC_UNAVAILABLE';
  await client.query(`INSERT INTO street_manager_source_runs(source,status,source_url,error_code) VALUES('plymouth_council','error',$1,$2)
   ON CONFLICT(source) DO UPDATE SET checked_at=now(),status='error',error_code=EXCLUDED.error_code`,[councilSourceUrl,code]);
  return {status:'error',errorCode:code,notices:previous?.item_count??0};
 }
}
