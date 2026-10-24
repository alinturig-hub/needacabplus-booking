const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in deps?deps[id]:require(id),m,m.exports);return m.exports}
test('driver invitations are one-use; sessions are isolated; job actions require ownership and the correct lifecycle',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();let admin=true,origin=true;const jar=new Map();const cookieStore={get:key=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key,value)=>jar.set(key,value)};
 try{await db.exec(`CREATE TABLE public."Driver"(id text PRIMARY KEY,"fullName" text,callsign text,active boolean,suspended boolean,archived boolean);INSERT INTO public."Driver" VALUES('a','Driver A','101',true,false,false),('b','Driver B','102',true,false,false),('inactive','Inactive','103',false,false,false);CREATE TABLE operations_settings(id text PRIMARY KEY,settings jsonb);`);await db.exec(fs.readFileSync('scripts/migrations/20261024_driver_app.sql','utf8'));await db.exec(fs.readFileSync('scripts/migrations/20261024_driver_offer_service.sql','utf8'));
 const client={query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows}},release(){}};const database=()=>({...client,connect:async()=>client});
 const driver=load('lib/driver-app.ts',{'next/headers':{cookies:async()=>cookieStore},'./database':{database}});
 const password=load('lib/customer-auth.ts',{'next/headers':{cookies:async()=>cookieStore},'@/lib/database':{database}});
 const security={isAdmin:async()=>admin,sameOrigin:()=>origin,unavailable:e=>{console.log('Unexpected backend error',e.message);return Response.json({error:'Unavailable'},{status:503})}};
 const engine=load('lib/native-dispatch-engine.ts',{'./dispatch-routing':load('lib/dispatch-routing.ts')});const common={'@/lib/database':{database},'@/lib/security':security,'@/lib/driver-app':driver};
 const adminApi=load('app/api/admin/driver-app/route.ts',{...common,'@/lib/native-dispatch-engine':engine,'@/lib/driver-service-types':load('lib/driver-service-types.ts')});
 const auth=load('app/api/driver/auth/route.ts',{...common,'@/lib/customer-auth':password,'@/lib/customer-verification':{requestAuthLimit:async()=>{},authLimit:async()=>{},AuthError:class extends Error{}}});
 const jobs=load('app/api/driver/job/route.ts',common),state=load('app/api/driver/state/route.ts',common);
 const req=body=>new Request('https://drivers.needacabplus.app/api/driver',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 admin=false;assert.equal((await adminApi.GET()).status,403);admin=true;assert.equal((await state.GET()).status,401);
 assert.equal((await adminApi.POST(req({action:'invite',driverId:'inactive',email:'inactive@example.test'}))).status,400);
 async function provision(id){const r=await adminApi.POST(req({action:'invite',driverId:id,email:id+'@example.test'}));assert.equal(r.status,200);const token=new URL((await r.json()).url).searchParams.get('invite');const activated=await auth.POST(req({action:'activate',token,password:'DriverTestPassword123!'}));assert.equal(activated.status,200);assert.equal((await auth.POST(req({action:'activate',token,password:'DriverTestPassword123!'}))).status,400);return{account:await driver.currentDriver(),cookie:jar.get('nac_driver_session')}}
 const a=await provision('a'),b=await provision('b');assert.notEqual(a.account.id,b.account.id);
 const r=await adminApi.POST(req({action:'training',accountId:a.account.id}));assert.equal(r.status,200);const job=(await db.query('SELECT * FROM driver_app_jobs WHERE account_id=$1',[a.account.id])).rows[0];assert.equal(job.training,true);assert.equal(job.service_type,'ASAP');for(const serviceType of ['Priority','Prebook','Guarantee']){assert.equal((await adminApi.POST(req({action:'training',accountId:b.account.id,serviceType}))).status,200);assert.equal((await db.query('SELECT service_type FROM driver_app_jobs WHERE account_id=$1 ORDER BY created_at DESC LIMIT 1',[b.account.id])).rows[0].service_type,serviceType)}assert.equal((await adminApi.POST(req({action:'training',accountId:a.account.id,serviceType:'UberX'}))).status,400);
 assert.equal((await jobs.POST(req({jobId:job.id,action:'accept'}))).status,409);jar.set('nac_driver_session',a.cookie);
 assert.equal((await jobs.POST(req({jobId:job.id,action:'pob'}))).status,409);
 for(const action of ['accept','arrive','pob','complete'])assert.equal((await jobs.POST(req({jobId:job.id,action}))).status,200,action);
 assert.equal((await jobs.POST(req({jobId:job.id,action:'complete'}))).status,409);const result=await(await state.GET()).json();assert.equal(result.jobs.length,0);assert.equal(result.history.length,1);assert.equal((await db.query('SELECT count(*)::int n FROM driver_app_events')).rows[0].n,4);
 origin=false;assert.equal((await state.PUT(req({online:true}))).status,403);origin=true;assert.equal((await state.PUT(req({online:true,latitude:50.37,longitude:-4.14,accuracy:10}))).status,200);
 await adminApi.POST(req({action:'disable',accountId:a.account.id}));assert.equal(await driver.currentDriver(),null);assert.equal((await auth.POST(req({action:'login',email:'a@example.test',password:'DriverTestPassword123!'}))).status,401);
 jar.set('nac_driver_session',b.cookie);assert.equal((await driver.currentDriver()).id,b.account.id);
 await adminApi.POST(req({action:'invite',driverId:'b',email:'b@example.test'}));assert.equal(await driver.currentDriver(),null,'reset invalidates existing sessions');
 }finally{await db.close()}
});
