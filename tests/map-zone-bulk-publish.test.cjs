const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in deps?deps[id]:require(id),m,m.exports);return m.exports}
const schema=load('lib/map-zone-schema.ts'),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],missing='33333333-3333-4333-8333-333333333333';
const geometry={type:'Polygon',coordinates:[[[-4.15,50.37],[-4.13,50.37],[-4.13,50.39],[-4.15,50.39],[-4.15,50.37]]]};
test('bulk publication authenticates, validates all drafts, guards versions, preserves history, and rolls back any partial failure',async()=>{
 const{PGlite}=await import('@electric-sql/pglite');const db=new PGlite();let admin=true,origin=true,failHistory=false,historyWrites=0;
 try{
 for(const path of ['20261024_map_zones.sql','20261024_map_zone_publication.sql','20261024_autocab_map_zones.sql','20261024_map_zone_deletion.sql'])await db.exec(fs.readFileSync('scripts/migrations/'+path,'utf8'));
 for(const[id,i]of ids.map((id,i)=>[id,i]))await db.query('INSERT INTO map_zones(id,name,colour,purpose,enabled,geometry) VALUES($1,$2,$3,$4,true,$5)',[id,'Plot '+i,'#123456','plot',JSON.stringify(geometry)]);
 const client={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO map_zone_versions')&&failHistory&&++historyWrites===2)throw Error('Injected history failure');return db.query(sql,args)},release(){}};
 const routes=load('app/api/admin/zones/bulk-publish/route.ts',{'@/lib/database':{database:()=>({connect:async()=>client})},'@/lib/security':{isAdmin:async()=>admin,sameOrigin:()=>origin,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/map-zone-schema':schema});
 const req=body=>new Request('https://admin.test/api/admin/zones/bulk-publish',{method:'POST',body:typeof body==='string'?body:JSON.stringify(body)}),batch=v=>({zones:ids.map(id=>({id,version:v}))}),read=async()=> (await db.query('SELECT id,version,published_version,published_snapshot FROM map_zones ORDER BY id')).rows;
 admin=false;assert.equal((await routes.POST(req(batch(1)))).status,403);admin=true;origin=false;assert.equal((await routes.POST(req(batch(1)))).status,403);origin=true;
 for(const body of ['{',{}, {zones:[]},{zones:[{id:ids[0],version:1},{id:ids[0],version:1}]},{zones:[{id:ids[0],version:0}]}])assert.equal((await routes.POST(req(body))).status,400);
 assert.equal((await routes.POST(req(' '.repeat(65537)))).status,413);
 assert.equal((await routes.POST(req({zones:[{id:ids[0],version:1},{id:missing,version:1}]}))).status,409);assert.ok((await read()).every(z=>z.version===1&&!z.published_snapshot));
 assert.equal((await routes.POST(req({zones:[{id:ids[0],version:1},{id:ids[1],version:2}]}))).status,409);
 await db.query('UPDATE map_zones SET geometry=$1 WHERE id=$2',[JSON.stringify({type:'Polygon',coordinates:[]}),ids[1]]);assert.equal((await routes.POST(req(batch(1)))).status,400);assert.ok((await read()).every(z=>z.version===1&&!z.published_snapshot));await db.query('UPDATE map_zones SET geometry=$1 WHERE id=$2',[JSON.stringify(geometry),ids[1]]);
 failHistory=true;historyWrites=0;assert.equal((await routes.POST(req(batch(1)))).status,503);assert.ok((await read()).every(z=>z.version===1&&!z.published_snapshot));assert.equal((await db.query('SELECT count(*)::int n FROM map_zone_versions')).rows[0].n,0);failHistory=false;
 let r=await routes.POST(req(batch(1)));assert.equal(r.status,200);assert.equal((await r.json()).published,2);let rows=await read();assert.ok(rows.every(z=>z.version===2&&z.published_version===2&&z.published_snapshot.geometry.type==='Polygon'));assert.equal((await db.query('SELECT count(*)::int n FROM map_zone_versions')).rows[0].n,2);
 assert.equal((await routes.POST(req(batch(1)))).status,409);r=await routes.POST(req(batch(2)));assert.equal((await r.json()).published,0);assert.ok((await read()).every(z=>z.version===2));
 await db.query("UPDATE map_zones SET name='Changed draft',version=3 WHERE id=$1",[ids[0]]);assert.equal((await read())[0].published_snapshot.name,'Plot 0');r=await routes.POST(req({zones:[{id:ids[0],version:3},{id:ids[1],version:2}]}));assert.equal((await r.json()).published,1);rows=await read();assert.equal(rows[0].published_snapshot.name,'Changed draft');assert.equal(rows[0].version,4);assert.equal(rows[1].version,2);
 await db.query('UPDATE map_zones SET deleted_at=now() WHERE id=$1',[ids[1]]);assert.equal((await routes.POST(req({zones:[{id:ids[0],version:4},{id:ids[1],version:2}]}))).status,409);assert.equal((await read())[0].version,4);
 }finally{await db.close()}
});
