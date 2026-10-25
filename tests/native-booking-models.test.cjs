const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in deps?deps[id]:require(id),mod,mod.exports);return mod.exports}
const native=load('lib/native-booking-policy.ts');
test('booking models migrate once and save independently; native live delivery and Autocab fields are rejected',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();let admin=true,origin=true;
 const autocab={cashEnabled:false,cardEnabled:true,liveBookingsEnabled:true,companyId:1,accountCustomerId:2155,bookingCapabilities:[42],priorityDelayMinutes:12,minPrebookMinutes:90};
 try{
  await db.exec("CREATE TABLE app_configuration(section text PRIMARY KEY CHECK(section IN('bookings','sms','identity')),settings jsonb NOT NULL DEFAULT '{}',secrets_encrypted text NOT NULL DEFAULT '',updated_at timestamptz DEFAULT now());CREATE TABLE operations_settings(id text PRIMARY KEY,settings jsonb NOT NULL DEFAULT '{}');");await db.query("INSERT INTO app_configuration(section,settings) VALUES('bookings',$1::jsonb)",[JSON.stringify(autocab)]);
  const migration=fs.readFileSync('scripts/migrations/20261025_native_booking_policy.sql','utf8');await db.exec(migration);
  const readConfiguration=async section=>(await db.query('SELECT settings FROM app_configuration WHERE section=$1',[section])).rows[0]||{settings:{}};
  const loader=load('lib/native-booking-configuration.ts',{'./app-configuration':{readConfiguration},'./native-booking-policy':native});
  let settings=await loader.loadNativeBookingPolicy();assert.equal(settings.cashEnabled,false);assert.equal(settings.minPrebookMinutes,90);assert.equal(settings.liveBookingsEnabled,false);assert.equal('companyId' in settings,false);assert.equal('bookingCapabilities' in settings,false);
  const routes=load('app/api/admin/native-booking-rules/route.ts',{'@/lib/database':{database:()=>db},'@/lib/security':{isAdmin:async()=>admin,sameOrigin:()=>origin,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/native-booking-configuration':loader,'@/lib/native-booking-policy':native});
  const request=body=>new Request('https://admin.needacabplus.app/api/admin/native-booking-rules',{method:'PUT',body:JSON.stringify(body)});
  admin=false;assert.equal((await routes.GET()).status,403);assert.equal((await routes.PUT(request(settings))).status,403);admin=true;origin=false;assert.equal((await routes.PUT(request(settings))).status,403);origin=true;
  for(const bad of [{...settings,liveBookingsEnabled:true},{...settings,companyId:9},{...settings,accountCustomerId:99},{...settings,minPrebookMinutes:0}])assert.equal((await routes.PUT(request(bad))).status,400);
  assert.equal((await routes.PUT(request({...settings,cashEnabled:true,minPrebookMinutes:45}))).status,200);assert.deepEqual((await readConfiguration('bookings')).settings,autocab);
  await db.exec(migration);settings=await loader.loadNativeBookingPolicy();assert.equal(settings.cashEnabled,true);assert.equal(settings.minPrebookMinutes,45,'Rerunning the migration must not copy Autocab settings over native edits');
  await db.query("UPDATE app_configuration SET settings=jsonb_set(settings,'{minPrebookMinutes}','120') WHERE section='bookings'");assert.equal((await loader.loadNativeBookingPolicy()).minPrebookMinutes,45);
  const engine=load('lib/native-dispatch-engine.ts',{'./dispatch-routing':load('lib/dispatch-routing.ts')});const dispatch=load('app/api/admin/native-dispatch/route.ts',{'@/lib/database':{database:()=>db},'@/lib/native-booking-configuration':loader,'@/lib/security':{isAdmin:async()=>true,unavailable:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/native-dispatch-engine':engine});
  assert.equal((await(await dispatch.GET()).json()).cashEnabled,true,'Native dispatch must use native cash, while Autocab cash is false');
  assert.equal((await(await routes.GET()).json()).liveBookingReady,false);
 }finally{await db.close()}
});
