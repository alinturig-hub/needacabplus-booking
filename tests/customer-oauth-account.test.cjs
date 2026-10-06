const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');

test('verified OAuth signs in existing identities, links matching email and creates new customers',async()=>{
 const db=new PGlite();await db.exec(fs.readFileSync('db/init.sql','utf8'));
 const query=async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.rows.length||result.affectedRows||0}};
 const adapter={query,connect:async()=>({query,release(){}})},sessions=[];
 const source=ts.transpileModule(fs.readFileSync(path.resolve('lib/customer-oauth-account.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
 new Function('require','module','exports',source)(id=>{
  if(id==='./database')return {database:()=>adapter};
  if(id==='./customer-auth')return {hashPassword:async()=> 'fixture-hash',setCustomerSession:async id=>sessions.push(id)};
  return require(id);
 },module,module.exports);
 const {completeOAuthAccount}=module.exports,linkedId=randomUUID();
 await query('INSERT INTO customer_accounts(id,email,password_hash,full_name,phone) VALUES($1,$2,$3,$4,$5)',[linkedId,'existing@example.test','hash','Existing Customer','07700900123']);
 await completeOAuthAccount('google','google-existing-email','existing@example.test','Google Name');
 assert.equal(sessions.at(-1),linkedId);assert.equal((await query('SELECT customer_id FROM customer_identities WHERE subject=$1',['google-existing-email'])).rows[0].customer_id,linkedId);
 await completeOAuthAccount('google','google-existing-email','existing@example.test','Google Name');
 assert.equal(sessions.at(-1),linkedId);
 await completeOAuthAccount('google','google-new','new@example.test','New Customer');
 const created=(await query('SELECT id,phone,full_name FROM customer_accounts WHERE email=$1',['new@example.test'])).rows[0];assert.equal(created.phone,'');assert.equal(created.full_name,'New Customer');assert.equal(sessions.at(-1),created.id);
 await db.close();
});
