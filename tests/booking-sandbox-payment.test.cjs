const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>deps[id]||require(id),m,m.exports);return m.exports}
const policy=load('lib/booking-policy.ts'),payments=load('lib/booking-payments.ts'),passenger=load('lib/passenger-payment.ts');
const quoteId='00000000-0000-4000-8000-000000000001',input={id:quoteId,quoteToken:'valid',name:'Test Passenger',phone:'+447000000000',pickup:'Public Station',destination:'Public Library',viaPoints:[],pickupNote:'',vehicle:'saloon',acknowledged:true};
async function setup(){
 const db=new PGlite();await db.exec(fs.readFileSync('scripts/migrations/20261018_booking_previews.sql','utf8'));await db.exec('CREATE TABLE bookings(id uuid,user_id text,status text)');
 let principal='customer',remoteSends=0,quote={id:quoteId,vehicle:'saloon',pickup:input.pickup,destination:input.destination,vias:[],service:'asap',scheduledAt:null,paymentMethod:'card',liveBooking:false,totalPence:1250};
 let intent={id:'pi_test',status:'succeeded',livemode:false,amount:1250,currency:'gbp',customer:'cus_own',metadata:{quoteId,customerId:'customer',purpose:'booking_sandbox'}};
 const route=load('app/api/bookings/route.ts',{
  '@/lib/customer-stripe':{customerStripeProfile:async()=>({settings:{mode:'test'},stripeCustomerId:'cus_own',stripe:{paymentIntents:{retrieve:async()=>intent}}})},'@/lib/passenger-payment':passenger,
  '@/lib/booking-policy':policy,'@/lib/booking-payments':payments,'@/lib/app-configuration':{loadBookingPolicy:async()=>policy.bookingPolicySchema.parse({})},'@/lib/booking-live-summary':{},'@/lib/booking-period':{},'@/lib/taxicrm-bookings':{},'@/lib/taxicrm-database':{taxiCrmNoBookingCopyEnabled:()=>true},'@/lib/quote-policy':{validateSchedule:()=>{}},'@/lib/customer-auth':{getCustomer:async()=>({id:principal,email:'test@example.invalid'})},'@/lib/customer-guest':{},'@/lib/database':{database:()=>db,bookingAttemptDatabase:()=>db},'@/lib/security':{sameOrigin:()=>true,unavailable:e=>{throw e}},'@/lib/quotes':{verifyQuote:()=>quote,loadQuotePolicy:async()=>({enabled:true,minPrebookMinutes:30}),activePaidMembership:async()=>null},'@/lib/autocab-booking-request':{},'@/lib/autocab-api':{createCashBooking:()=>{remoteSends++}},'@/lib/live-cash-booking':{readLiveAttempt:async()=>null}
 });
 return {db,post:(extra={})=>route.POST(new Request('https://example.test/api/bookings',{method:'POST',body:JSON.stringify({...input,...extra})})),setIntent:value=>{intent={...intent,...value}},setPrincipal:value=>{principal=value},setQuote:value=>{quote={...quote,...value}},remoteSends:()=>remoteSends};
}
test('unpaid, pending and mismatched card payments cannot create a preview',async()=>{
 const t=await setup();try{
  assert.equal((await t.post()).status,409);
  for(const patch of [{status:'requires_action'},{status:'succeeded',amount:100},{amount:1250,livemode:true},{livemode:false,customer:'cus_other'}]){t.setIntent(patch);assert.equal((await t.post({paymentIntentId:'pi_test'})).status,409)}
  assert.equal((await t.db.query('SELECT count(*)::int n FROM web_booking_previews')).rows[0].n,0);assert.equal(t.remoteSends(),0);
 }finally{await t.db.close()}
});
test('verified sandbox payment is idempotent and never inserts an operational booking',async()=>{
 const t=await setup();try{
  assert.equal((await t.post({paymentIntentId:'pi_test'})).status,201);assert.equal((await t.post({paymentIntentId:'pi_test'})).status,200);
  assert.equal((await t.db.query('SELECT count(*)::int n FROM web_booking_previews')).rows[0].n,1);
  assert.equal((await t.db.query('SELECT count(*)::int n FROM bookings')).rows[0].n,0);assert.equal(t.remoteSends(),0);
  t.setPrincipal('other');assert.equal((await t.post({paymentIntentId:'pi_test'})).status,409);
 }finally{await t.db.close()}
});
test('cash sandbox preview needs no Stripe intent and makes no dispatch call',async()=>{
 const t=await setup();try{t.setQuote({paymentMethod:'cash'});assert.equal((await t.post()).status,201);assert.equal((await t.db.query('SELECT payment_intent_id FROM web_booking_previews')).rows[0].payment_intent_id,null);assert.equal(t.remoteSends(),0)}finally{await t.db.close()}
});
