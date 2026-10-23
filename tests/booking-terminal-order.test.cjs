const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load(file,deps){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(!(id in deps))throw Error('Unexpected '+id);return deps[id]},mod,mod.exports);return mod.exports}
const state=load('lib/autocab/booking-state.ts',{});
const normalize=s=>s.replace(/[^a-z0-9]/gi,'').toLowerCase();
for(const terminal of ['COMPLETED','CANCELLED','NO_FARE'])test(`${terminal} applies despite newer context receipt, while retaining newer payload`,async()=>{
 const current={id:'b',status:'POB'};let projection,snapshot;
 const prior={eventType:'BookingModified',payload:{},receivedAt:new Date('2026-10-22T15:25:02.274Z')};
 const event={id:'e',eventType:({COMPLETED:'BookingComplete',CANCELLED:'BookingCancelled',NO_FARE:'BookingNoFare'})[terminal],payload:{Id:'1'},receivedAt:new Date('2026-10-22T15:25:02.309Z')};
 const occurred=new Date('2026-10-22T15:25:02.210Z');
 const {persistBookingEvent}=load('lib/autocab/booking-event-persistence.ts',{
 '@/lib/autocab/booking-detail-recovery.mjs':{recoverBookingDetails:()=>({patch:{},locations:[],vias:[]})},
 '@/lib/autocab/assignment-details.mjs':{recoverAssignmentDetails:()=>({changed:false})},
 '@/lib/autocab/booking-upsert':{upsertBooking:async()=>current.id},
 '@/lib/autocab/booking-state':state,
 '@/lib/autocab/webhook-processing':{normaliseEventType:normalize,bookingExternalId:()=> '1',lockWebhookEntities:async()=>{},webhookOccurredAt:item=>item===event?occurred:item.receivedAt},
 '@/lib/autocab/booking-json-projection':{projectBookingJson:async(_tx,options)=>{projection=options}},
 '@/lib/autocab/booking-mappers':{isObject:v=>v!==null&&typeof v==='object'},
 });
 const tx={webhookEvent:{findUniqueOrThrow:async()=>event,findMany:async()=>[prior],update:async()=>{}},booking:{findUnique:async()=>({...current}),findUniqueOrThrow:async()=>({...current}),update:async({data})=>Object.assign(current,data),updateMany:async({data})=>Object.assign(current,data)},bookingTimelineEvent:{create:async()=>{}},bookingSnapshot:{aggregate:async()=>({_max:{version:0}}),create:async({data})=>{snapshot=data.snapshot}}};
 await persistBookingEvent(tx,'e',{title:'Final status',description:'Final status',status:terminal});
 assert.equal(current.status,terminal);assert.equal(projection.operationalStatus,terminal);assert.equal(projection.preserveExisting,true);assert.equal(snapshot.status,terminal);
 // A newer lifecycle event still blocks an older terminal event.
 current.status='POB';prior.eventType='BookingPOB';
 await persistBookingEvent(tx,'e',{title:'Final status',description:'Final status',status:terminal});
 assert.equal(current.status,'POB');
});
