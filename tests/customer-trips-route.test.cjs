const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');

test('customer trip history is scoped to the signed-in customer and returns a compact safe shape',async()=>{
 let queryText='',queryValues=[];
 const rows=[{id:'550e8400-e29b-41d4-a716-446655440000',external_booking_id:null,pickup:'Royal William Yard',destination:'Plymouth Station',via_points:['The Hoe'],vehicle:'saloon',fare_pence:1250,status:'Booked',booking_type:'ASAP',payment_type:'Card',timeline_data:{scheduledAt:'2026-09-30T12:00:00Z'},created_at:new Date('2026-09-30T11:00:00Z')}];
 const route={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/api/customer/trips/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='@/lib/customer-auth'?{getCustomer:async()=>({id:'customer-7'})}:id==='@/lib/database'?{database:()=>({query:async(text,values)=>{queryText=text;queryValues=values;return{rows}}})}:id==='@/lib/security'?{unavailable:error=>{throw error}}:require(id),route,route.exports);
 const response=await route.exports.GET(),data=await response.json();
 assert.equal(response.status,200);assert.match(queryText,/WHERE user_id=\$1/);assert.deepEqual(queryValues,['customer-7']);assert.deepEqual(data.trips[0],{id:rows[0].id,reference:'NAC-550E8400',pickup:'Royal William Yard',destination:'Plymouth Station',viaPoints:['The Hoe'],vehicle:'saloon',farePence:1250,status:'Booked',bookingType:'ASAP',paymentType:'Card',scheduledAt:'2026-09-30T12:00:00Z',createdAt:'2026-09-30T11:00:00.000Z'});assert.equal('phone' in data.trips[0],false);
});

test('customer trip history rejects guests before reading the database',async()=>{
 let queried=false;const route={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/api/customer/trips/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='@/lib/customer-auth'?{getCustomer:async()=>null}:id==='@/lib/database'?{database:()=>({query:async()=>{queried=true}})}:id==='@/lib/security'?{unavailable:error=>{throw error}}:require(id),route,route.exports);
 const response=await route.exports.GET();assert.equal(response.status,401);assert.equal(queried,false);
});
