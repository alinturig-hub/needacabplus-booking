const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),crypto=require('node:crypto');
const compile=(file,resolve)=>{const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(resolve,m,m.exports);return m.exports;};
test('full OAuth handlers preserve two browser attempts, consume state once and reject missing browser proof',async()=>{
 const jar=new Map(),states=new Map(),identities=[],hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const browser=compile('lib/oauth-browser.ts',require),errors=compile('lib/oauth-errors.ts',require);
 const db={query:async(sql,args)=>{if(sql.startsWith('INSERT')){states.set(args[0],{provider:args[1],browser_hash:args[2],nonce:args[3],verifier:args[4]});return {rows:[]}}const row=states.get(args[0]);if(!row||row.provider!==args[1]||row.browser_hash!==args[2])return {rows:[]};states.delete(args[0]);return {rows:[row]}}};
 const flow=compile('lib/customer-oauth.ts',id=>{
  if(id==='./oauth-browser')return browser;if(id==='./oauth-errors')return errors;
  if(id==='next/headers')return {cookies:async()=>({set:(k,v)=>jar.set(k,v),get:k=>jar.has(k)?{value:jar.get(k)}:undefined,delete:k=>jar.delete(k)})};
  if(id==='./database')return {database:()=>db};
  if(id==='./app-configuration')return {loadIdentityPolicy:async()=>({googleEnabled:true,googleClientId:'synthetic-client'}),readConfiguration:async()=>({secrets_encrypted:'synthetic'})};
  if(id==='./credentials')return {decryptCredentials:()=>({googleClientSecret:'synthetic-secret'})};
  if(id==='./customer-verification')return {hash,AuthError:class extends Error{}};
  if(id==='./oauth-token')return {verifyIdentityToken:async(token,provider,client,nonce)=>({nonce,sub:'synthetic-sub',email:'synthetic@example.test',email_verified:true,name:'Demo'})};
  if(id==='./customer-oauth-account')return {completeOAuthAccount:async(...args)=>{identities.push(args);return 'synthetic-account'}};
  return require(id);
 });
 const oldFetch=global.fetch;let exchanges=0;
 global.fetch=async(url,input)=>{exchanges++;assert.equal(input.body.get('client_id'),'synthetic-client');assert.ok(input.body.get('code_verifier'));return {ok:true,json:async()=>({id_token:'synthetic-token'})}};
 try{
  const a=new URL(await flow.startOAuth('google')),b=new URL(await flow.startOAuth('google'));assert.equal(jar.size,2);
  assert.equal(await flow.finishOAuth('google','synthetic-code-b',b.searchParams.get('state')),'synthetic-account');
  assert.equal(await flow.finishOAuth('google','synthetic-code-a',a.searchParams.get('state')),'synthetic-account');
  assert.equal(exchanges,2);assert.equal(identities.length,2);assert.equal(jar.size,0);assert.equal(states.size,0);
  await assert.rejects(()=>flow.finishOAuth('google','replay',a.searchParams.get('state')),e=>e.code==='provider_browser_missing');assert.equal(exchanges,2);
  const c=new URL(await flow.startOAuth('google'));jar.clear();await assert.rejects(()=>flow.finishOAuth('google','missing-browser',c.searchParams.get('state')),e=>e.code==='provider_browser_missing');assert.equal(exchanges,2);
 }finally{global.fetch=oldFetch}
});
