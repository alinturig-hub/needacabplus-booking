const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const output=ts.transpileModule(fs.readFileSync('lib/admin-mfa.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded={exports:{}};
new Function('require','module','exports',output)((id)=>{
 if(id==='next/headers')return {cookies:async()=>({})};
 if(id==='./database')return {database:()=>({})};
 if(id==='./credentials')return {encryptCredentials:()=>'',decryptCredentials:()=>({})};
 if(id==='./app-configuration')return {loadSmsPolicy:async()=>({})};
 if(id==='./sms-transport')return {sendSmsMessage:async()=>{}};
 if(id==='./customer-verification')return {authLimit:async()=>{},normalizePhone:p=>p};
 return require(id);
},loaded,loaded.exports);
const {totp,matchingTotpStep,newTotpSecret,setupSmsCode,checkSetupSmsCode}=loaded.exports;
test('authenticator codes match RFC 6238 SHA-1 vectors and reject reuse',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 assert.equal(totp(secret,1),'287082');
 assert.equal(totp(secret,37037036),'081804');
 const current=Math.floor(Date.now()/30000),code=totp(secret,current);
 assert.equal(matchingTotpStep(secret,code,current-1),current);
 assert.equal(matchingTotpStep(secret,code,current),null);
 assert.equal(matchingTotpStep(secret,'12345'),null);
});
test('generated authenticator secret and SMS setup codes have usable formats',()=>{
 assert.match(newTotpSecret(),/^[A-Z2-7]{32}$/);
 process.env.ADMIN_SESSION_SECRET='test-admin-session-secret-with-32-characters';
 const {code,hash}=setupSmsCode('+447700900123');
 assert.match(code,/^\d{6}$/);
 assert.equal(checkSetupSmsCode('+447700900123',code,hash),true);
 assert.equal(checkSetupSmsCode('+447700900999',code,hash),false);
});
