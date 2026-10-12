const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const source=fs.readFileSync('app/api/admin/login/route.ts','utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function route(state){
 let sessions=0,challenges=0;
 const module={exports:{}};
 new Function('require','module','exports',output)(id=>{
  if(id==='@/lib/security')return {setAdminSession:async()=>{sessions++},validCredentials:()=>true,sameOrigin:()=>true};
  if(id==='@/lib/admin-mfa')return {adminSecurity:async()=>state,beginLoginChallenge:async()=>{challenges++},hasMfa:row=>Boolean(row.totp_secret_encrypted||row.sms_phone),maskedPhone:()=> '•••• 0123',sendLoginSms:async()=>{}};
  if(id==='@/lib/customer-verification')return {authLimit:async()=>{}};
  return require(id);
 },module,module.exports);
 return {post:module.exports.POST,counts:()=>({sessions,challenges})};
}
const request=()=>new Request('https://admin.needacabplus.app/api/admin/login',{method:'POST',headers:{origin:'https://admin.needacabplus.app','content-type':'application/json'},body:JSON.stringify({email:'admin@needacabplus.app',password:'correct'})});
test('password alone does not create an admin session when 2FA is enabled',async()=>{
 const app=route({totp_secret_encrypted:'encrypted-secret',sms_phone:''});
 const response=await app.post(request());assert.equal(response.status,200);
 assert.equal((await response.json()).mfaRequired,true);
 assert.deepEqual(app.counts(),{sessions:0,challenges:1});
});
test('password still creates a session while 2FA is disabled',async()=>{
 const app=route({totp_secret_encrypted:'',sms_phone:''});
 const response=await app.post(request());assert.equal(response.status,200);
 assert.deepEqual(app.counts(),{sessions:1,challenges:0});
});
