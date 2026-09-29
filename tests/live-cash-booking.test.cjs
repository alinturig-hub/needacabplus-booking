const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');const {PGlite}=require('@electric-sql/pglite');
function load(path,deps={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>deps[id]||require(id),mod,mod.exports);return mod.exports;}
const {submitLiveCashBooking,readLiveAttempt}=load('lib/live-cash-booking.ts');
const {saveAutocabBooking}=load('lib/autocab-bookings.ts',{'./dispatch-queue':load('lib/dispatch-queue.ts'),'./booking-requirements':load('lib/booking-requirements.ts'),'./booking-reference':load('lib/booking-reference.ts')});
const id='00000000-0000-4000-8000-000000000001';
const quote={id,pickup:'Station',destination:'Home',vias:[],vehicle:'saloon',totalPence:1200};
const body={name:'Passenger',telephoneNumber:'+447000000000',driverNote:'Entrance',customerEmail:'test@example.invalid',passengers:'1',luggage:0,pickup:{address:{text:'Station'}},destination:{address:{text:'Home'}},vias:[],pricing:{cost:7,bookingCost:7,price:12,bookingPrice:12},pickupDueTimeUtc:new Date().toISOString(),ourReference:'NAC-'+id};
async function withDb(fn){const db=new PGlite();try{await db.exec(fs.readFileSync('db/init.sql','utf8'));await fn(db)}finally{await db.close()}}
test('successful cash creation persists Autocab ID and cannot be sent twice',()=>withDb(async db=>{
 let sent=0;const send=async()=>{sent++;return {bookingId:123}};
 const result=await submitLiveCashBooking(db,quote,'customer',body,send);assert.equal(result.pending,false);assert.equal(result.externalBookingId,'123');assert.equal(sent,1);
 await submitLiveCashBooking(db,quote,'customer',body,send);assert.equal(sent,1);
 assert.equal((await db.query('SELECT user_id,payment_type FROM bookings')).rows[0].payment_type,'Cash');assert.equal(await readLiveAttempt(db,id,'another-customer'),null);
 await assert.rejects(()=>submitLiveCashBooking(db,quote,'another-customer',body,send));assert.equal(sent,1);
}));
test('timeout is unresolved, concurrent/repeated submission is not replayed, webhook resolves it',()=>withDb(async db=>{
 let release;const gate=new Promise(resolve=>release=resolve);let sent=0;
 const first=submitLiveCashBooking(db,quote,'customer',body,async()=>{sent++;await gate;throw new Error('timeout')});
 while(!sent)await new Promise(resolve=>setTimeout(resolve,5));
 const repeated=await submitLiveCashBooking(db,quote,'customer',body,async()=>{sent++;return {bookingId:1}});assert.equal(repeated.pending,true);assert.equal(sent,1);release();assert.equal((await first).pending,true);
 const other={...quote,id:'00000000-0000-4000-8000-000000000002'};await assert.rejects(()=>submitLiveCashBooking(db,other,'customer',body,async()=>{sent++;return {bookingId:2}}));assert.equal(sent,1);
 await saveAutocabBooking(db,{...body,bookingId:123},'Booking Created');const resolved=await readLiveAttempt(db,id,'customer');assert.equal(resolved.pending,false);assert.equal(resolved.externalBookingId,'123');assert.equal((await db.query('SELECT user_id FROM bookings')).rows[0].user_id,'customer');
}));
test('early webhook keeps advanced status and does not duplicate bookings',()=>withDb(async db=>{
 const result=await submitLiveCashBooking(db,quote,'customer',body,async()=>{await saveAutocabBooking(db,{...body,bookingId:123},'Driver Accepted');await db.query("UPDATE bookings SET status='Driver Accepted'");return {bookingId:123}});
 assert.equal(result.pending,false);const rows=(await db.query('SELECT user_id,status FROM bookings')).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'Driver Accepted');assert.equal(rows[0].user_id,'customer');
}));
test('invalid successful API response is never called confirmed',()=>withDb(async db=>{
 const result=await submitLiveCashBooking(db,quote,'customer',body,async()=>({}));assert.equal(result.pending,true);assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n,0);
}));

test('documented rejection is shown as not created and never replayed',()=>withDb(async db=>{let sent=0;const send=async()=>{sent++;throw Object.assign(new Error('invalid request'),{status:400})};const result=await submitLiveCashBooking(db,quote,'customer',body,send);assert.equal(result.rejected,true);assert.equal(result.pending,false);assert.equal(result.externalBookingId,null);await submitLiveCashBooking(db,quote,'customer',body,send);assert.equal(sent,1);}));
