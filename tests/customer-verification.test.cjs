const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
test('OTP registration, limits, expiry, replay and trusted devices use real SQL',async()=>{
 const priorSecret=process.env.ADMIN_SESSION_SECRET;process.env.ADMIN_SESSION_SECRET='test-only-secret-with-more-than-32-characters';
 const db=new PGlite();await db.exec(fs.readFileSync('db/init.sql','utf8'));
 const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.rows.length||r.affectedRows||0}};
 const adapter={query,connect:async()=>({query,release(){}})};
 const jar=new Map();const cookieStore={get:k=>jar.has(k)?{value:jar.get(k)}:undefined,set:(k,v)=>{if(v)jar.set(k,v);else jar.delete(k)}};
 const modules=new Map();const sessions=[];
 function load(name){if(modules.has(name))return modules.get(name);const p=path.resolve('lib',name+'.ts');const out=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};modules.set(name,module.exports);new Function('require','module','exports',out)(id=>{
  if(id==='next/headers')return {cookies:async()=>cookieStore};
  if(id==='./database'||id==='@/lib/database')return {database:()=>adapter};
  if(id==='./customer-auth')return {setCustomerSession:async id=>sessions.push(id)};
  if(id.startsWith('./'))return load(id.slice(2));
  return require(id);
 },module,module.exports);return module.exports}
 const credentials=load('credentials'),api=load('customer-verification');
 await query('INSERT INTO app_configuration(section,settings) VALUES($1,$2::jsonb)',['sms',JSON.stringify({enabled:true,endpoint:'https://sms.example.test/send'})]);
 await query('INSERT INTO app_configuration(section,settings) VALUES($1,$2::jsonb)',['identity',JSON.stringify({registrationOtp:true,newDeviceOtp:true})]);
 const originalFetch=global.fetch;let deliveredCode,deliveries=0;
 global.fetch=async(url,options)=>{assert.equal(String(url),'https://sms.example.test/send');const payload=JSON.parse(options.body);deliveredCode=payload.message.match(/\b\d{6}\b/)[0];deliveries++;return new Response('{}',{status:200})};
 try{
  assert.equal(api.normalizePhone('07700 900123'),'+447700900123');
  const result=await api.beginChallenge('register','07700 900123',{email:'otp@example.test',passwordHash:'fixture',fullName:'Test Person'});
  assert.equal(result.verificationRequired,true);assert.equal('code' in result,false);
  assert.equal((await query('SELECT * FROM customer_accounts')).rows.length,0);
  const saved=(await query('SELECT * FROM customer_auth_challenges')).rows[0];assert.notEqual(saved.code_hash,deliveredCode);assert.ok(!saved.payload_encrypted.includes('otp@example.test'));
  await assert.rejects(api.beginChallenge('register','07700 900123',{}),/Too many attempts/);assert.equal(deliveries,1);
  const correct=deliveredCode;await assert.rejects(api.finishChallenge(correct==='000000'?'000001':'000000'),/Incorrect/);
  assert.equal((await query('SELECT attempts FROM customer_auth_challenges')).rows[0].attempts,1);
  await api.finishChallenge(correct);assert.equal(sessions.length,1);const customer=(await query('SELECT * FROM customer_accounts')).rows[0];assert.ok(customer.phone_verified_at);assert.ok(await api.trustedDevice(customer.id));
  await assert.rejects(api.finishChallenge(correct),/Start verification/);
  jar.delete('nac_trusted_device');await query('DELETE FROM customer_auth_limits');
  assert.equal((await api.completeLogin(customer.id,customer.phone)).verificationRequired,true);assert.equal(sessions.length,1);
  const lastCode=deliveredCode;await query('UPDATE customer_auth_challenges SET attempts=5 WHERE consumed_at IS NULL');await assert.rejects(api.finishChallenge(lastCode),/too many attempts/);
  await query("UPDATE customer_auth_challenges SET attempts=0,expires_at=now()-make_interval(secs=>1) WHERE consumed_at IS NULL");await assert.rejects(api.finishChallenge(lastCode),/expired/);
  await query('DELETE FROM customer_auth_limits');global.fetch=async()=>new Response('',{status:500});
  const before=(await query('SELECT count(*) AS n FROM customer_auth_challenges')).rows[0].n;await assert.rejects(api.beginChallenge('register','07700 900124',{}),/rejected/);assert.equal((await query('SELECT count(*) AS n FROM customer_auth_challenges')).rows[0].n,before);
  assert.deepEqual(credentials.decryptCredentials(credentials.encryptCredentials({token:'private'})),{token:'private'});
 }finally{global.fetch=originalFetch;await db.close();if(priorSecret===undefined)delete process.env.ADMIN_SESSION_SECRET;else process.env.ADMIN_SESSION_SECRET=priorSecret}
});
