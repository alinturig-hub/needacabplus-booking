const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('lib/stripe-wallet-domain.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,m,m.exports);return m.exports}
test('registers only the canonical booking domain and reuses the configuration check',async()=>{
 const {prepareStripeWalletDomain}=load();let lists=0,creates=0;
 const stripe={paymentMethodDomains:{list:async params=>{lists++;assert.equal(params.domain_name,'webapp.needacabplus.app');return {data:[]}},create:async params=>{creates++;assert.deepEqual(params,{domain_name:'webapp.needacabplus.app'});return {enabled:true,apple_pay:{status:'active'},google_pay:{status:'active'}}}}};
 assert.deepEqual(await prepareStripeWalletDomain(stripe,'test-profile'),{registered:true,applePay:'active',googlePay:'active'});
 await prepareStripeWalletDomain(stripe,'test-profile');assert.equal(lists,1);assert.equal(creates,1);
});
test('domain readiness failure keeps cards usable and reports wallets unavailable',async()=>{
 const {prepareStripeWalletDomain}=load();const stripe={paymentMethodDomains:{list:async()=>{throw new Error('Restricted API key')}}};
 assert.deepEqual(await prepareStripeWalletDomain(stripe,'test'),{registered:false,applePay:'unavailable',googlePay:'unavailable'});
});
