const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in deps?deps[id]:require(id),mod,mod.exports);return mod.exports}
const schema=load('lib/map-zone-schema.ts');
const zone={name:'Plymouth Central',colour:'#d4b66a',purpose:'operational',enabled:true,geometry:{type:'Polygon',coordinates:[[[-4.15,50.37],[-4.13,50.37],[-4.13,50.39],[-4.15,50.39],[-4.15,50.37]]]}};
test('zone geometry rejects crossing, open, degenerate and out-of-range rings',()=>{
 assert.ok(schema.mapZoneInputSchema.safeParse(zone).success);
 for(const ring of [ [[0,0],[1,1],[0,1],[1,0],[0,0]], [[0,0],[1,0],[1,1],[0,1]], [[0,0],[1,0],[2,0],[0,0]], [[181,0],[1,0],[1,1],[181,0]] ])assert.equal(schema.mapZoneInputSchema.safeParse({...zone,geometry:{type:'Polygon',coordinates:[ring]}}).success,false);
});
test('zone API protects writes and publishes immutable live snapshots independently of drafts',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();let admin=true,origin=true;
 try{await db.exec(fs.readFileSync('scripts/migrations/20261024_map_zones.sql','utf8'));await db.exec(fs.readFileSync('scripts/migrations/20261024_map_zone_publication.sql','utf8'));await db.exec(fs.readFileSync('scripts/migrations/20261024_autocab_map_zones.sql','utf8'));await db.exec(fs.readFileSync('scripts/migrations/20261024_map_zone_deletion.sql','utf8'));
 const client={query:async(sql,args)=>{const r=await db.query(sql,args);return{...r,rowCount:r.affectedRows}},release(){}};
 const routes=load('app/api/admin/zones/route.ts',{'@/lib/database':{database:()=>({...client,connect:async()=>client})},'@/lib/security':{isAdmin:async()=>admin,sameOrigin:()=>origin,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/map-zone-schema':schema});
 const request=(value)=>new Request('https://admin.needacabplus.app/api/admin/zones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 admin=false;assert.equal((await routes.GET()).status,403);assert.equal((await routes.POST(request(zone))).status,403);admin=true;origin=false;assert.equal((await routes.POST(request(zone))).status,403);origin=true;
 let response=await routes.POST(request(zone));assert.equal(response.status,201);let saved=(await response.json()).zone;assert.equal(saved.version,1);assert.equal(saved.published_snapshot,null);assert.equal((await(await routes.GET(new Request('https://admin.needacabplus.app/api/admin/zones?view=live'))).json()).zones.length,0);
 assert.equal((await routes.POST(request(zone))).status,409);
 response=await routes.PUT(request({...zone,id:saved.id,version:1,enabled:false}));assert.equal(response.status,200);saved=(await response.json()).zone;assert.equal(saved.version,2);assert.equal(saved.enabled,false);
 assert.equal((await routes.PUT(request({...zone,id:saved.id,version:1}))).status,409);
 // Publish the saved draft. Later draft changes must not replace the live snapshot.
 response=await routes.PATCH(request({id:saved.id,version:saved.version,action:'publish'}));assert.equal(response.status,200);saved=(await response.json()).zone;assert.equal(saved.published_version,3);assert.equal(saved.published_snapshot.enabled,false);
 response=await routes.PUT(request({...zone,id:saved.id,version:saved.version,name:'New draft name'}));assert.equal(response.status,200);saved=(await response.json()).zone;assert.equal(saved.published_snapshot.name,zone.name);assert.equal(saved.published_snapshot.enabled,false);assert.equal(saved.version,4);
 assert.equal((await routes.PATCH(request({id:saved.id,version:3,action:'publish'}))).status,409);
 response=await routes.PATCH(request({id:saved.id,version:4,action:'publish'}));saved=(await response.json()).zone;assert.equal(saved.published_snapshot.name,'New draft name');assert.equal((await(await routes.GET(new Request('https://admin.needacabplus.app/api/admin/zones?view=live'))).json()).zones[0].name,'New draft name');
 response=await routes.PATCH(request({id:saved.id,version:saved.version,action:'unpublish'}));saved=(await response.json()).zone;assert.equal(saved.published_snapshot,null);assert.equal(saved.geometry.type,'Polygon');
 await db.exec(fs.readFileSync('scripts/migrations/20261024_map_zone_publication.sql','utf8'));assert.equal((await(await routes.GET()).json()).zones[0].published_snapshot,null,'Rerunning migration must not publish drafts');
 admin=false;assert.equal((await routes.PATCH(request({id:saved.id,version:saved.version,action:'publish'}))).status,403);admin=true;
 const versions=await db.query('SELECT count(*)::int n FROM map_zone_versions');assert.equal(versions.rows[0].n,6);assert.equal((await(await routes.GET()).json()).zones.length,1);
 await db.exec(`CREATE TABLE public."Zone" ("externalId" text,name text,"rawPayload" jsonb,provider text,"companyId" int,active boolean,"mdtZoneId" int); INSERT INTO public."Zone" VALUES('2062','Pennycross','{"zoneType":"Normal","boundary":[{"longitude":0,"latitude":0},{"longitude":1,"latitude":0},{"longitude":1,"latitude":1}]}','AUTOCAB',1,true,1);`);
 await db.query("UPDATE map_zones SET source_provider='AUTOCAB',source_external_id='2062' WHERE id=$1",[saved.id]);
 response=await routes.PATCH(request({id:saved.id,version:saved.version,action:'publish'}));saved=(await response.json()).zone;
 admin=false;assert.equal((await routes.DELETE(request({id:saved.id,version:saved.version}))).status,403);admin=true;origin=false;assert.equal((await routes.DELETE(request({id:saved.id,version:saved.version}))).status,403);origin=true;
 assert.equal((await routes.DELETE(request({id:saved.id,version:saved.version-1}))).status,409);
 assert.equal((await routes.DELETE(request({id:saved.id,version:saved.version}))).status,200);
 assert.equal((await(await routes.GET()).json()).zones.length,0);assert.equal((await(await routes.GET(new Request('https://admin.needacabplus.app/api/admin/zones?view=live'))).json()).zones.length,0);
 const retained=(await db.query('SELECT deleted_at,version,published_snapshot FROM map_zones WHERE id=$1',[saved.id])).rows[0];assert.ok(retained.deleted_at);assert.equal(retained.published_snapshot,null);
 const referenceRoute=load('app/api/admin/zones/references/route.ts',{'@/lib/database':{database:()=>client},'@/lib/security':{isAdmin:async()=>true,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/map-zone-display':load('lib/map-zone-display.ts')});assert.deepEqual((await(await referenceRoute.GET()).json()).zones,[],'Deleting an imported zone must not make it reappear as a source reference');
 assert.equal((await db.query('SELECT count(*)::int n FROM map_zone_versions WHERE zone_id=$1',[saved.id])).rows[0].n,8);
 assert.equal((await routes.PUT(request({...zone,id:saved.id,version:retained.version}))).status,409);
 assert.equal((await routes.PATCH(request({id:saved.id,version:retained.version,action:'publish'}))).status,409);
 assert.equal((await routes.POST(request({...zone,name:saved.name}))).status,201,'Deleted names can be reused without losing the original history');
 }finally{await db.close()}
});
test('Autocab plots retain boundaries, remove zero-length duplicate vertices and reject crossing source polygons',()=>{
 const {prepareAutocabZone}=load('lib/autocab/zone-import.ts',{'@/lib/map-zone-schema':schema});
 const record={externalId:'2062',name:'Pennycross',active:true,mdtZoneId:1,descriptor:'PNX',rawPayload:{zoneType:'Normal',boundary:[{longitude:0,latitude:0},{longitude:1,latitude:0},{longitude:1,latitude:0},{longitude:1,latitude:1},{longitude:0,latitude:1}]}};
 assert.deepEqual(prepareAutocabZone(record).geometry.coordinates[0],[[0,0],[1,0],[1,1],[0,1],[0,0]]);
 assert.equal(prepareAutocabZone(record).purpose,'plot');
 assert.equal(prepareAutocabZone({...record,rawPayload:{...record.rawPayload,zoneType:'NoGps'}}).purpose,'system');
 assert.throws(()=>prepareAutocabZone({...record,rawPayload:{zoneType:'Normal',boundary:[{longitude:0,latitude:0},{longitude:1,latitude:1},{longitude:0,latitude:1},{longitude:1,latitude:0}]}}));
});
test('UK operating boundary includes all four nations and excludes Dublin and Paris',()=>{
 const feature=JSON.parse(fs.readFileSync('scripts/data/uk-operating-area.geojson','utf8'));
 const geometry=schema.zoneGeometrySchema.parse(feature.geometry);assert.equal(geometry.type,'MultiPolygon');
 const {pointInZone}=load('lib/native-dispatch-engine.ts',{'./dispatch-routing':{milesBetween(){return 0}}});
 const inside=(latitude,longitude)=>geometry.coordinates.some(coordinates=>pointInZone({latitude,longitude},{id:'part',geometry:{type:'Polygon',coordinates}}));
 for(const p of [[50.3755,-4.1427],[51.5074,-0.1278],[55.9533,-3.1883],[51.4816,-3.1791],[54.5973,-5.9301]])assert.ok(inside(...p),String(p));
 assert.equal(inside(53.3498,-6.2603),false);assert.equal(inside(48.8566,2.3522),false);
});
test('overview labels preserve MDT codes and reference boundaries remain distinct from editable zones',()=>{
 const {zoneMapFeatures,autocabReferenceZone}=load('lib/map-zone-display.ts');
 const plot={...zone,id:'plot',purpose:'plot',source_payload:{mdtZoneId:47,descriptor:'MUT',centre:{longitude:-4.14,latitude:50.38}}};
 const reference=autocabReferenceZone({externalId:'2080',name:'Parkway W',rawPayload:{zoneType:'Normal',mdtZoneId:19,descriptor:'PRKW',boundary:[{longitude:0,latitude:0},{longitude:1,latitude:1},{longitude:0,latitude:1},{longitude:1,latitude:0}]}});
 assert.equal(reference.reference,true);assert.equal(reference.geometry.coordinates[0].length,5);
 assert.equal(autocabReferenceZone({externalId:'bad',name:'bad',rawPayload:{zoneType:'Normal',boundary:[{longitude:NaN,latitude:0}]}}),null);
 const features=zoneMapFeatures([plot,{...zone,id:'UK'},{...zone,id:'system',purpose:'system'},reference],'plot');
 assert.equal(features.boundaries.features.length,3);assert.equal(features.labels.features.length,2);
 assert.equal(features.labels.features[0].properties.label,'(47) MUT');assert.deepEqual(features.labels.features[0].geometry.coordinates,[-4.14,50.38]);
 assert.equal(features.boundaries.features[0].properties.selected,true);assert.equal(features.boundaries.features[2].properties.reference,true);
});
test('Autocab reference endpoint is administrator-only and excludes non-geographic system records',async()=>{
 let admin=false,calls=0;const route=load('app/api/admin/zones/references/route.ts',{'@/lib/security':{isAdmin:async()=>admin,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/database':{database:()=>({query:async sql=>{calls++;assert.match(sql,/companyId.*=1/);assert.match(sql,/NOT EXISTS/);return{rows:[{externalId:'2080',name:'Parkway W',rawPayload:{zoneType:'Normal',boundary:[{longitude:0,latitude:0},{longitude:1,latitude:1},{longitude:0,latitude:1},{longitude:1,latitude:0}]}},{externalId:'445',name:'Break',rawPayload:{zoneType:'LongBreak',boundary:[]}}]}}})},'@/lib/map-zone-display':load('lib/map-zone-display.ts')});
 assert.equal((await route.GET()).status,403);assert.equal(calls,0);admin=true;const response=await route.GET();assert.equal(response.status,200);assert.equal((await response.json()).zones.length,1);
});
