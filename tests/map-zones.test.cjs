const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in deps?deps[id]:require(id),mod,mod.exports);return mod.exports}
const schema=load('lib/map-zone-schema.ts');
const zone={name:'Plymouth Central',colour:'#d4b66a',purpose:'operational',enabled:true,geometry:{type:'Polygon',coordinates:[[[-4.15,50.37],[-4.13,50.37],[-4.13,50.39],[-4.15,50.39],[-4.15,50.37]]]}};
test('zone geometry rejects crossing, open, degenerate and out-of-range rings',()=>{
 assert.ok(schema.mapZoneInputSchema.safeParse(zone).success);
 for(const ring of [ [[0,0],[1,1],[0,1],[1,0],[0,0]], [[0,0],[1,0],[1,1],[0,1]], [[0,0],[1,0],[2,0],[0,0]], [[181,0],[1,0],[1,1],[181,0]] ])assert.equal(schema.mapZoneInputSchema.safeParse({...zone,geometry:{type:'Polygon',coordinates:[ring]}}).success,false);
});
test('zone API authenticates writes, persists revisions, rejects duplicate names and stale updates',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();let admin=true,origin=true;
 try{await db.exec(fs.readFileSync('scripts/migrations/20261024_map_zones.sql','utf8'));
 const client={query:async(sql,args)=>{const r=await db.query(sql,args);return{...r,rowCount:r.affectedRows}},release(){}};
 const routes=load('app/api/admin/zones/route.ts',{'@/lib/database':{database:()=>({...client,connect:async()=>client})},'@/lib/security':{isAdmin:async()=>admin,sameOrigin:()=>origin,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/map-zone-schema':schema});
 const request=(value)=>new Request('https://admin.needacabplus.app/api/admin/zones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 admin=false;assert.equal((await routes.GET()).status,403);assert.equal((await routes.POST(request(zone))).status,403);admin=true;origin=false;assert.equal((await routes.POST(request(zone))).status,403);origin=true;
 let response=await routes.POST(request(zone));assert.equal(response.status,201);let saved=(await response.json()).zone;assert.equal(saved.version,1);
 assert.equal((await routes.POST(request(zone))).status,409);
 response=await routes.PUT(request({...zone,id:saved.id,version:1,enabled:false}));assert.equal(response.status,200);saved=(await response.json()).zone;assert.equal(saved.version,2);assert.equal(saved.enabled,false);
 assert.equal((await routes.PUT(request({...zone,id:saved.id,version:1}))).status,409);
 const versions=await db.query('SELECT count(*)::int n FROM map_zone_versions');assert.equal(versions.rows[0].n,2);assert.equal((await(await routes.GET()).json()).zones.length,1);
 }finally{await db.close()}
});
