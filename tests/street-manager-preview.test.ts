import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {streetGeometry,geometryBounds} from '../lib/street-manager/geometry';
import {loadStreetPreview,previewItem,type PreviewRow} from '../lib/street-manager/preview-data';
import {validStreetPreview,previewExpiresAt} from '../lib/street-manager/preview-access';
import {GET} from '../app/api/street-manager/preview/[token]/route';
const data={highway_authority_swa_code:'1160',street_name:'SYNTHETIC STREET',work_status_ref:'in_progress',traffic_management_type:'Road closure',works_location_coordinates:JSON.stringify({type:'Point',coordinates:[248000,55000]}),proposed_start_date:'2026-11-09T00:00:00Z',proposed_start_time:null,contact_email:'DO_NOT_EXPOSE',new_private_field:'DO_NOT_EXPOSE'};
const row:PreviewRow={object_type:'PERMIT',object_reference:'SYNTHETIC',event_type:'WORK_START',event_time:'2026-11-09T10:00:00Z',received_at:'2026-11-09T10:01:00Z',event_data:{object_data:data}};
test('BNG projection matches a published OS control point and places Plymouth correctly',()=>{
 const g=streetGeometry('POINT(651409.903 313177.270)');assert.equal(g?.type,'Point');if(g?.type!=='Point')throw Error('Missing point');assert.ok(Math.abs(g.coordinates[0]-1.716052)<.0001);assert.ok(Math.abs(g.coordinates[1]-52.657979)<.0001);
 const local=streetGeometry(JSON.stringify({type:'Point',coordinates:[248000,55000]}));assert.ok(local);const b=geometryBounds(local!);assert.ok(b[0]>-4.2&&b[0]<-4.1&&b[1]>50.3&&b[1]<50.5);
});
test('GeoJSON, features, collections and WKT extents preserve shape; invalid locations are not fabricated',()=>{
 const line=streetGeometry('LINESTRING(248000 55000,248100 55100)');assert.equal(line?.type,'LineString');
 const collection=streetGeometry({type:'FeatureCollection',features:[{type:'Feature',properties:{arbitrary:'discard'},geometry:{type:'Point',coordinates:[248000,55000]}}]});assert.equal(collection?.type,'GeometryCollection');assert.equal(JSON.stringify(collection).includes('arbitrary'),false);
 assert.equal(streetGeometry('POLYGON((248000 55000,248100 55000,248100 55100,248000 55000))')?.type,'Polygon');
 for(const value of [null,'garbage','POINT(-4.14 50.37)','SRID=4326;POINT(248000 55000)',{type:'LineString',coordinates:[[248000,55000]]},{type:'Polygon',coordinates:[[[248000,55000],[248100,55000],[248100,55100]]]}, {type:'Point',coordinates:[Infinity,55000]},'POINT EMPTY'])assert.equal(streetGeometry(value),null);
});
test('preview exposes public fields only, preserves absent clocks, flags cancellations/reverts and section 58',()=>{
 const item=previewItem(row)!;assert.equal(item.state,'in_progress');assert.equal(item.color,'#f87171');assert.ok(item.geometry);assert.equal(item.details.find(d=>d.label==='Proposed start time')?.value,null);assert.equal(JSON.stringify(item).includes('DO_NOT_EXPOSE'),false);
 assert.equal(previewItem({...row,event_data:{object_data:{...data,highway_authority_swa_code:'1100'}}}),null);
 assert.equal(previewItem({...row,event_type:'PERMIT_CANCELLED'})?.state,'ended');
 assert.equal(previewItem({...row,event_type:'WORK_STOP_REVERTED'})?.state,'unknown');
 assert.equal(previewItem({...row,same_time_versions:2})?.state,'unknown');
 const section=previewItem({...row,object_type:'SECTION_58',event_type:'SECTION_58_CREATED',event_data:{object_data:{highway_authority_swa_code:'1160',section_58_coordinates:'POINT(248000 55000)',section_58_status:'in_force'}}})!;assert.equal(section.state,'restriction');assert.ok(section.warnings.some(s=>s.includes('does not itself mean')));
});
test('latest source event wins over late delivery; national history excluded and same-time updates flagged',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(readFileSync('scripts/migrations/20261108_street_manager_inbox.sql','utf8'));
  const insert=async(message:string,ref:string,time:string,received:string,d:Record<string,unknown>,type='WORK_START')=>db.query(`INSERT INTO street_manager_events(topic_arn,message_id,event_reference,event_type,object_type,object_reference,event_time,sns_timestamp,schema_version,event_data,received_at) VALUES('synthetic',$1,$1,$2,'PERMIT',$3,$4,$4,1,$5,$6)`,[message,type,ref,time,JSON.stringify({object_data:d}),received]);
  await insert('new','one','2026-11-09T12:00:00Z','2026-11-09T12:01:00Z',data,'PERMIT_CANCELLED');
  await insert('late','one','2026-11-09T10:00:00Z','2026-11-09T13:01:00Z',data);
  await insert('outside','outside','2026-11-09T14:00:00Z','2026-11-09T14:01:00Z',{...data,highway_authority_swa_code:'1100'});
  await insert('same-a','two','2026-11-09T14:00:00Z','2026-11-09T14:01:00Z',data);
  await insert('same-b','two','2026-11-09T14:00:00Z','2026-11-09T14:02:00Z',data,'WORK_STOP');
  const client={query:(sql:string,params:unknown[])=>db.query(sql,params)} as unknown as Parameters<typeof loadStreetPreview>[0];
  const result=await loadStreetPreview(client);assert.equal(result.receivedEvents,4);assert.equal(result.totalObjects,2);assert.equal(result.items.length,2);assert.equal(result.items.find(i=>i.reference==='one')?.state,'ended');assert.equal(result.items.find(i=>i.reference==='two')?.state,'unknown');
 }finally{await db.close()}
});
test('temporary capability rejects invalid/expired tokens before database access',async()=>{
 assert.equal(validStreetPreview('wrong'),false);assert.equal(validStreetPreview('x'.repeat(43),Date.parse(previewExpiresAt)+1),false);
 const response=await GET(new Request('https://example.test/api/street-manager/preview/invalid'),{params:Promise.resolve({token:'invalid'})});assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
