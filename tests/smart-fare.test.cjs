const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,deps={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>deps[id]||require(id),mod,mod.exports);return mod.exports}
const policyModule=load('lib/quote-policy.ts',{'./prebook-time.js':require('../lib/prebook-time.js')});
const smart=load('lib/smart-fare.ts');
const requestModule=load('lib/autocab-quote-request.ts');
const bookingModule=load('lib/autocab-booking-request.ts');
const place=text=>({text,coordinate:{latitude:50.37,longitude:-4.14},zoneId:1});
const input={pickup:place('Public station'),destination:place('Public hospital'),vias:[],vehicle:'saloon',service:'asap',paymentMethod:'cash',scheduledAt:null};
function harness({policy={},waiting=0,cars=8,staleBookings=false,staleCars=false,discount=8,discountFails=false,signalsFail=false,signalDb=null}={}){
 const settings=policyModule.quotePolicySchema.parse({smartFareMode:'live',...policy});
 const rules=load('lib/booking-policy.ts').bookingPolicySchema.parse({bookingCapabilities:[7,42],priorityDelayMinutes:7,paymentMethod:'cash'});
 const calls=[];let signed;
 const db={query:async sql=>{
  if(sql.includes("settings->'liveQuotes'"))return {rows:[{policy:settings}]};
  if(signalDb)return signalDb.query(sql);
  if(signalsFail)throw new Error('feed unavailable');
  if(sql.includes('max(updated_at)'))return {rows:[{latest:new Date(Date.now()-(staleBookings?600000:0))}]};
  if(sql.includes('SELECT pickup_data'))return {rows:Array.from({length:waiting},()=>({pickup_data:{dueTime:new Date().toISOString()}}))};
  throw new Error('Unexpected SQL: '+sql);
 }};
 const module=load('lib/quotes.ts',{
  './booking-payments':load('lib/booking-payments.ts'),'./app-configuration':{loadBookingPolicy:async()=>rules},
  '@/lib/autocab-time.mjs':{autocabTime:Date.parse},'./autocab-quote-request':requestModule,
  './quote-presentation':load('lib/quote-presentation.ts'),'./autocab-booking-request':bookingModule,
  './quote-token':{signQuote:q=>{signed=q;return 'test-token'}},'./smart-fare':smart,
  './database':{database:()=>db},'./quote-policy':policyModule,
  './live-drivers':{publicClearVehicles:async()=>Array.from({length:cars},()=>({recordedAt:new Date(Date.now()-(staleCars?600000:0)).toISOString()}))},
  './autocab-api':{bookingQuote:async request=>{calls.push(request);const lower=request.capabilities.includes(42);if(lower&&discountFails)throw new Error('Autocab unavailable');return {outward:{price:lower?discount:10,cost:lower?5:7,bookingCost:lower?4:6}}}},
 });
 return {module,calls,settings,signed:()=>signed};
}
test('quiet NOW uses the lower fare and carries the matching capabilities and costs into booking',async()=>{
 const h=harness();const result=await h.module.createQuote(input);
 assert.equal(result.quote.totalPence,800);assert.equal(result.quote.smartFareApplied,true);
 assert.deepEqual(h.calls.map(x=>x.capabilities),[[7],[7,42]]);
 assert.equal(h.calls[0].pickupDueTimeUtc,h.calls[1].pickupDueTimeUtc);
 const quote=h.signed();assert.equal(quote.upliftPence,0);assert.equal(quote.bookingRules.priorityDelayMinutes,0);
 assert.equal(result.quote.smartFare,undefined);
 const body=bookingModule.buildAutocabBookingRequest(quote,{name:'Test User',telephoneNumber:'+447000000000',customerEmail:'test@example.invalid',passengers:1,luggage:0});
 assert.deepEqual(body.capabilities,[7,42]);assert.equal(body.pricing.price,8);assert.equal(body.pricing.cost,5);assert.equal(body.pricing.bookingCost,4);
});
test('busy, low supply, stale and unavailable signals all keep normal NOW pricing',async()=>{
 for(const options of [{waiting:3},{cars:4},{staleBookings:true},{staleCars:true},{signalsFail:true},{policy:{smartFareMode:'off'}}]){
  const h=harness(options),result=await h.module.createQuote(input);
  assert.equal(result.quote.totalPence,1000);assert.equal(h.calls.length,1);assert.deepEqual(h.signed().autocabRequest.capabilities,[7]);
 }
});
test('higher, unchanged, invalid and failed capability fares fall back to the entire normal quote',async()=>{
 for(const options of [{discount:11},{discount:10},{discount:0},{discountFails:true}]){
  const h=harness(options),result=await h.module.createQuote(input);
  assert.equal(result.quote.totalPence,1000);assert.equal(h.signed().smartFare.applied,false);
  assert.deepEqual(h.signed().autocabRequest.capabilities,[7]);assert.equal(h.signed().autocabCosts.cost,7);
 }
});
test('shadow compares fares without changing the customer price',async()=>{
 const h=harness({policy:{smartFareMode:'shadow'}}),result=await h.module.createQuote(input);
 assert.equal(result.quote.totalPence,1000);assert.equal(h.calls.length,2);assert.equal(h.signed().smartFare.candidatePence,800);assert.equal(h.signed().smartFare.reason,'shadow');
});
test('Priority, Pre-book and Guarantee have separate capabilities and additions',async()=>{
 for(const [service,capability,totalPence] of [['priority',9,1200],['prebook',10,1100],['guarantee',11,1200]]){
  const h=harness({policy:{serviceCapabilities:{priority:[9],prebook:[10],guarantee:[11]},priorityUpliftMode:'fixed',priorityFixedAmount:2,prebookUpliftMode:'fixed',prebookFixedAmount:1,guaranteePercent:20}});
  const scheduledAt=service==='priority'?null:new Date(Math.ceil((Date.now()+3600000)/300000)*300000).toISOString();
  const result=await h.module.createQuote({...input,service,scheduledAt});
  assert.equal(result.quote.totalPence,totalPence);assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].capabilities,[7,capability]);
 }
 const h=harness({policy:{serviceCapabilities:{priority:[42,9]}}});await h.module.createQuote({...input,service:'priority'});assert.deepEqual(h.calls[0].capabilities,[7,42,9]);
});
test('NOW accepts immediate bookings only and never inherits Priority additions',()=>{
 assert.throws(()=>policyModule.validateSchedule('asap',new Date().toISOString(),30));
 assert.deepEqual(policyModule.fareAdjustment(policyModule.defaultQuotePolicy,'asap',100,1),{percent:0,fixedPence:0,demand:'normal'});
 assert.equal(smart.smartFareDecision(policyModule.defaultQuotePolicy,{waiting:2,clear:8,fresh:true}).quiet,true);
 assert.equal(policyModule.quotePolicySchema.safeParse({serviceCapabilities:{asap:[42]}}).success,false);
 assert.equal(policyModule.quotePolicySchema.safeParse({smartFareCapabilities:[99],serviceCapabilities:{asap:[99]}}).success,false);
});
test('admin calculation exposes the same complete service fare without issuing a booking token',async()=>{
 const h=harness({policy:{priorityUpliftMode:'fixed',priorityFixedAmount:2.5}});
 const preview=await h.module.calculateQuote({...input,service:'priority'});
 assert.equal(preview.basePence,1000);assert.equal(preview.upliftPence,250);assert.equal(preview.totalPence,1250);assert.equal(h.signed(),undefined);
 const customer=await h.module.createQuote({...input,service:'priority'});
 assert.equal(customer.quote.totalPence,preview.totalPence);assert.equal(h.signed().upliftPence,preview.upliftPence);
});
test('signal SQL runs against the application schema and counts overdue jobs but excludes future and allocated jobs',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(fs.readFileSync('db/init.sql','utf8'));
  const h=harness({signalDb:db});assert.equal((await h.module.smartFareSnapshot(h.settings)).fresh,false);
  const now=Date.now();
  for(const [index,offset,driver] of [[1,-3600000,null],[2,300000,null],[3,7200000,null],[4,0,{id:12}]]){
   await db.query("INSERT INTO bookings(id,user_id,name,phone,pickup,destination,vehicle,fare_pence,status,external_booking_id,last_event_type,timeline_data,driver_data) VALUES($1,'test','Test','07000','Station','Hospital','saloon',1000,'Booked',$2,'BookingCreated',$3::jsonb,$4::jsonb)",[`00000000-0000-4000-8000-00000000000${index}`,String(index),JSON.stringify({scheduledAt:new Date(now+offset).toISOString()}),JSON.stringify(driver)]);
  }
  assert.deepEqual(await h.module.smartFareSnapshot(h.settings),{waiting:2,clear:8,fresh:true});
  await db.exec("UPDATE bookings SET updated_at=now()-interval '10 minutes'");
  assert.equal((await h.module.smartFareSnapshot(h.settings)).fresh,false);
 }finally{await db.close()}
});
