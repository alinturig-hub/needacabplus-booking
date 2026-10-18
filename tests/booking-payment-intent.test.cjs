const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>deps[id]||require(id),m,m.exports);return m.exports}
const policy=load('lib/booking-policy.ts'),payments=load('lib/booking-payments.ts');
function setup(overrides={}){
 let sent=[];const quote={id:'quote',paymentMethod:'card',liveBooking:false,totalPence:1290,service:'asap',scheduledAt:null,...overrides.quote};
 const route=load('app/api/customer/booking-payment/route.ts',{
  '@/lib/passenger-payment':load('lib/passenger-payment.ts'),'@/lib/customer-auth':{getCustomer:async()=>overrides.guest?null:{id:'customer'}},'@/lib/security':{sameOrigin:()=>!overrides.badOrigin},
  '@/lib/customer-stripe':{customerStripeProfile:async()=>({stripeCustomerId:'cus_own',settings:{mode:overrides.mode||'test',publishableKey:'pk_test_fixture'},stripe:{paymentMethods:{retrieve:async()=>({customer:overrides.foreignCard?'cus_other':'cus_own'})},paymentIntents:{create:async(params,options)=>{sent.push({params,options});return {id:'pi_test',client_secret:'secret_test'}}}}})},
  '@/lib/quotes':{verifyQuote:()=>quote,loadQuotePolicy:async()=>({enabled:true,minPrebookMinutes:30}),activePaidMembership:async()=>null},'@/lib/app-configuration':{loadBookingPolicy:async()=>policy.bookingPolicySchema.parse({liveBookingsEnabled:Boolean(overrides.live)})},'@/lib/booking-policy':policy,'@/lib/booking-payments':payments,'@/lib/quote-policy':{validateSchedule:()=>{}}
 });
 return {post:(body={quoteToken:'valid'})=>route.POST(new Request('https://example.test/api/customer/booking-payment',{method:'POST',body:JSON.stringify(body)})),sent};
}
test('sandbox payment amount and idempotency come from the signed quote, not the browser',async()=>{
 const t=setup();assert.equal((await t.post()).status,200);assert.equal((await t.post()).status,200);
 assert.equal(t.sent[0].params.amount,1290);assert.equal(t.sent[0].params.currency,'gbp');assert.equal(t.sent[0].params.metadata.customerId,'customer');assert.equal(t.sent[0].params.metadata.quoteId,'quote');assert.equal(t.sent[0].options.idempotencyKey,t.sent[1].options.idempotencyKey);
 const invalid=setup();assert.equal((await invalid.post({quoteToken:'valid',amount:1})).status,409);assert.equal(invalid.sent.length,0);
});
test('no real or unauthorised payment intent can be created',async()=>{
 for(const opts of [{mode:'live'},{live:true,quote:{liveBooking:true}},{foreignCard:true},{quote:{paymentMethod:'cash'}},{quote:{service:'priority'}}]){
  const t=setup(opts);assert.equal((await t.post({quoteToken:'valid',paymentMethodId:'pm_card'})).status,409);assert.equal(t.sent.length,0);
 }
 assert.equal((await setup({guest:true}).post()).status,401);assert.equal((await setup({badOrigin:true}).post()).status,403);
});
