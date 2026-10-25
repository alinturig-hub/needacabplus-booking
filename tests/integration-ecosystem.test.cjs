const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in deps?deps[id]:require(id.startsWith('.')?require('node:path').resolve(require('node:path').dirname(file),id):id),mod,mod.exports);return mod.exports}
const policy=load('lib/quote-policy.ts'),scopes=load('lib/quote-policy-scopes.ts',{'./quote-policy':policy});
test('master switch stops shared providers, prevents bypass and restores individual states; stale admin writes rejected',async()=>{
 const{PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE operations_settings(id text PRIMARY KEY,settings jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());CREATE TABLE "AutocabApiConfiguration"(id text PRIMARY KEY,provider text,"isEnabled" boolean);CREATE TABLE "WebhookProvider"(id text PRIMARY KEY,"isEnabled" boolean);INSERT INTO "AutocabApiConfiguration" VALUES('api','AUTOCAB',true);INSERT INTO "WebhookProvider" VALUES('autocab',false),('other',true);`);
 const migrate=()=>db.exec(fs.readFileSync('scripts/migrations/20261025_integration_ecosystem.sql','utf8'));await migrate();await db.exec(fs.readFileSync('scripts/migrations/20261025_integration_shared_gate.sql','utf8'));
 const guard=load('lib/integration-control.ts',{'./database':{database:()=>db}}),security={isAdmin:async()=>true,sameOrigin:()=>true,unavailable:e=>{throw e}};
 const routes=load('app/api/admin/integration-controls/route.ts',{'@/lib/database':{database:()=>db},'@/lib/security':security});
 const put=(enabled,version)=>routes.PUT(new Request('https://admin.test/api/admin/integration-controls',{method:'PUT',body:JSON.stringify({enabled,version})}));
 assert.equal(await guard.autocabIntegrationEnabled(),true);assert.equal((await put(false,1)).status,200);await assert.rejects(guard.requireAutocabIntegration(),/disabled/);
 assert.equal((await db.query('SELECT "isEnabled" FROM "AutocabApiConfiguration"')).rows[0].isEnabled,false);
 await assert.rejects(db.exec('UPDATE "AutocabApiConfiguration" SET "isEnabled"=true'),/master integration is disabled/);
 assert.equal((await put(true,1)).status,409);await migrate();assert.equal(await guard.autocabIntegrationEnabled(),false,'Rerunning seed never reactivates integration');
 assert.equal((await put(true,2)).status,200);assert.equal((await db.query('SELECT "isEnabled" FROM "AutocabApiConfiguration"')).rows[0].isEnabled,true);assert.equal((await db.query(`SELECT "isEnabled" FROM "WebhookProvider" WHERE id='autocab'`)).rows[0].isEnabled,false,'Previously disabled webhook remains disabled');assert.equal((await db.query(`SELECT "isEnabled" FROM "WebhookProvider" WHERE id='other'`)).rows[0].isEnabled,true);
 }finally{await db.close()}
});
test('independent pricing models and feature saves preserve other screens; native cannot activate vendor quotes',async()=>{
 const{PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE operations_settings(id text PRIMARY KEY,settings jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());`);await db.query(`INSERT INTO operations_settings VALUES('pricing',$1,now())`,[JSON.stringify({liveQuotes:{...policy.defaultQuotePolicy,lowPercent:12},nativeQuotes:{...policy.defaultQuotePolicy,lowPercent:5}})]);
 let enabled=true;const pool={connect:async()=>({query:(...a)=>db.query(...a),release:()=>{}})};
 const route=load('app/api/admin/quote-settings/route.ts',{'@/lib/database':{database:()=>pool},'@/lib/security':{isAdmin:async()=>true,sameOrigin:()=>true,unavailable:e=>{throw e}},'@/lib/quote-policy':policy,'@/lib/quote-policy-scopes':scopes,'@/lib/pricing-feature-scopes':load('lib/pricing-feature-scopes.ts'),'@/lib/quotes':{},'@/lib/smart-fare':{},'@/lib/integration-control':{requireAutocabIntegration:async()=>{if(!enabled)throw Error('disabled')}}});
 const patch=(model,feature,value)=>route.PATCH(new Request('https://admin.test/api/admin/quote-settings?model='+model,{method:'PATCH',body:JSON.stringify({model,scope:'shared',feature,policy:value})}));
 const stale={...policy.defaultQuotePolicy,enabled:true,lowPercent:14,membership:{...policy.defaultQuotePolicy.membership,enabled:true}};
 assert.equal((await patch('native','membership',stale)).status,200);let saved=(await db.query("SELECT settings FROM operations_settings WHERE id='pricing'")).rows[0].settings;
 assert.equal(saved.nativeQuotes.lowPercent,5);assert.equal(saved.liveQuotes.lowPercent,12);assert.equal(saved.nativeQuotes.enabled,false);assert.equal(saved.nativeQuotes.membership.enabled,true);
 enabled=false;assert.equal((await patch('native','fares',{...policy.defaultQuotePolicy,lowPercent:7})).status,200);await assert.rejects(patch('autocab','fares',stale),/disabled/);
 saved=(await db.query("SELECT settings FROM operations_settings WHERE id='pricing'")).rows[0].settings;assert.equal(saved.nativeQuotes.lowPercent,7);assert.equal(saved.nativeQuotes.membership.enabled,true);assert.equal(saved.liveQuotes.lowPercent,12);
 }finally{await db.close()}
});
test('Autocab routes are blocked without blocking native modules or retained history',()=>{const{autocabRoute}=load('lib/integration-routes.ts');for(const path of ['/api/admin/autocab/test','/api/webhooks/autocab/booking','/api/customer/booking-payment','/api/drivers/live/stream','/api/dispatch/assistant'])assert.equal(autocabRoute(path,'POST'),true);assert.equal(autocabRoute('/api/admin/quote-settings','PATCH','native'),false);for(const path of ['/api/admin/native-dispatch','/api/admin/native-booking-rules','/api/driver/location','/api/admin/zones','/api/admin/bookings'])assert.equal(autocabRoute(path,'GET'),false)});
