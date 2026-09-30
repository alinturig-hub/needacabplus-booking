const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

function loadSecurity(store){
 const output=ts.transpileModule(fs.readFileSync('lib/security.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{}};
 new Function('require','module','exports',output)(id=>id==='next/headers'?{cookies:async()=>store}:require(id),loaded,loaded.exports);
 return loaded.exports;
}

function cookieStore(){
 const values=new Map(),writes=[];
 return {
  writes,
  getAll(name){return (values.get(name)||[]).map(value=>({name,value}))},
  set(name,value,options){writes.push({name,value,options});values.set(name,value?[value]:[])},
  inject(name,...cookies){values.set(name,cookies)},
 };
}

test('admin login writes distinct host and shared cookies and ignores stale legacy cookies',async()=>{
 const previous={email:process.env.ADMIN_EMAIL,secret:process.env.ADMIN_SESSION_SECRET,origin:process.env.APP_ORIGIN};
 process.env.ADMIN_EMAIL='admin@needacabplus.app';process.env.ADMIN_SESSION_SECRET='test-admin-session-secret-with-32-characters';process.env.APP_ORIGIN='https://webapp.needacabplus.app';
 const store=cookieStore();store.inject('nac_admin_session','stale-value');
 try{
  const security=loadSecurity(store);
  await security.setAdminSession();
  assert.deepEqual(store.writes.map(write=>write.name),['nac_admin_session','nac_admin_session_v2','nac_admin_shared_session_v2']);
  assert.equal(store.writes[1].options.domain,undefined);
  assert.equal(store.writes[2].options.domain,'.needacabplus.app');
  assert.equal(await security.isAdmin(),true);
  store.inject('nac_admin_session_v2','invalid');
  assert.equal(await security.isAdmin(),true,'the valid shared cookie survives a stale host cookie');
  await security.clearAdminSession();
  assert.equal(await security.isAdmin(),false);
 }finally{
  for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name==='email'?'ADMIN_EMAIL':name==='secret'?'ADMIN_SESSION_SECRET':'APP_ORIGIN'];else process.env[name==='email'?'ADMIN_EMAIL':name==='secret'?'ADMIN_SESSION_SECRET':'APP_ORIGIN']=value}
 }
});
