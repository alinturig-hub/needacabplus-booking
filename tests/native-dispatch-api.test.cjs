const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in deps?deps[id]:require(id),m,m.exports);return m.exports}
const engine=load('lib/native-dispatch-engine.ts',{'./dispatch-routing':load('lib/dispatch-routing.ts')});
test('native configuration is authenticated, preserves legacy settings and rechecks cash at every request',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();let admin=true,origin=true,cash=true;
 try{await db.exec("CREATE TABLE operations_settings(id text PRIMARY KEY CHECK(id IN('dispatch','pricing','stripe')),settings jsonb NOT NULL DEFAULT '{}',updated_at timestamptz DEFAULT now());INSERT INTO operations_settings(id,settings) VALUES('dispatch','{\"maximumRadiusMiles\":8}')");
 const api=load('app/api/admin/native-dispatch/route.ts',{'@/lib/database':{database:()=>({query:(sql,args)=>db.query(sql,args)})},'@/lib/app-configuration':{loadBookingPolicy:async()=>({cashEnabled:cash})},'@/lib/security':{isAdmin:async()=>admin,sameOrigin:()=>origin,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/native-dispatch-engine':engine});
 const req=data=>new Request('https://admin.needacabplus.app/api/admin/native-dispatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 admin=false;assert.equal((await api.GET()).status,403);assert.equal((await api.PUT(req({}))).status,403);assert.equal((await api.POST(req({}))).status,403);admin=true;origin=false;assert.equal((await api.PUT(req({}))).status,403);origin=true;
 assert.equal((await api.PUT(req({offerSeconds:0}))).status,400);
 const rules=engine.nativeDispatchRulesSchema.parse({method:'zone_queue',offerSeconds:60,driverCount:5});assert.equal((await api.PUT(req(rules))).status,200);
 assert.equal((await db.query("SELECT settings->>'maximumRadiusMiles' radius FROM operations_settings WHERE id='dispatch'")).rows[0].radius,'8');
 let config=await(await api.GET()).json();assert.equal(config.effectiveRules.noFarePriority,true);assert.equal(config.liveDeliveryReady,false);cash=false;config=await(await api.GET()).json();assert.equal(config.effectiveRules.noFarePriority,false);assert.equal(config.rules.noFarePriority,true);
 const methodApi=load('app/api/dispatch/method/route.ts',{'@/lib/database':{database:()=>({query:(sql,args)=>db.query(sql,args)})},'@/lib/security':{isDispatchUser:async()=>true,sameOrigin:()=>origin,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/native-dispatch-engine':engine});
 admin=false;assert.equal((await api.PUT(req(rules))).status,403);assert.equal((await methodApi.PUT(req({method:'nearest',control:'manual'}))).status,200);assert.equal((await methodApi.PUT(req({method:'nearest',control:'manual',offerSeconds:999}))).status,400);admin=true;
 const persisted=(await db.query("SELECT settings FROM operations_settings WHERE id='dispatch'")).rows[0].settings;assert.equal(persisted.nativeRules.offerSeconds,60);assert.equal(persisted.nativeMethodChanges.length,1);assert.equal(persisted.nativeRules.method,'nearest');
 const preview=await(await api.POST(req({driverCount:5}))).json();assert.equal(preview.simulationOnly,true);assert.deepEqual(preview.offers.map(o=>o.opensAfterSeconds),[0,12,24,36,48]);assert.ok(preview.offers.every(o=>o.expiresAfterSeconds===60));
 assert.equal((await db.query('SELECT count(*)::int n FROM operations_settings')).rows[0].n,1);
 }finally{await db.close()}
});
