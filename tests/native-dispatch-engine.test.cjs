const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in deps?deps[id]:require(id),mod,mod.exports);return mod.exports}
const e=load('lib/native-dispatch-engine.ts',{'./dispatch-routing':load('lib/dispatch-routing.ts')});const now=1000000;
const zone={id:'mutley',geometry:{type:'Polygon',coordinates:[[[-4.2,50.3],[-4,50.3],[-4,50.5],[-4.2,50.5],[-4.2,50.3]]]}};
const rules=(change={})=>e.nativeDispatchRulesSchema.parse({method:'zone_queue',...change});
const driver=(id,n,change={})=>({id,latitude:50.3755,longitude:-4.1427+n*.001,zoneId:'mutley',enteredAt:now-60000+n*1000,queuedAt:now-60000+n*1000,gpsAt:now,available:true,noFare:false,bookingId:null,...change});
const job=(id='j',change={})=>({id,latitude:50.3755,longitude:-4.1427,zoneId:'mutley',driverId:null,pob:false,status:'waiting',...change});
const initial=()=>({drivers:Array.from({length:5},(_,i)=>driver(String(i+1),i)),jobs:[job()],rounds:[],eventIds:[],cashEnabled:true});
let sequence=0;const event=(kind,extra={})=>({id:'event-'+(++sequence),kind,at:now,...extra});
test('zone FIFO, 60/5 progressive schedule, common expiry and first valid acceptance wins',()=>{
 let state=initial();const round=e.startRound(state,'j',rules(),now);assert.deepEqual(round.offers.map(o=>(o.opensAt-now)/1000),[0,12,24,36,48]);assert.ok(round.offers.every(o=>o.expiresAt===now+60000));
 assert.throws(()=>e.applyNativeEvent(state,event('accept',{driverId:'2',jobId:'j',at:now+1000}),rules(),true),/available/);
 state=e.applyNativeEvent(state,event('accept',{driverId:'3',jobId:'j',at:now+25000}),rules(),true);assert.equal(state.jobs[0].driverId,'3');assert.equal(state.rounds[0].offers.filter(o=>o.status==='accepted').length,1);assert.equal(state.rounds[0].offers.filter(o=>o.status==='closed').length,4);
 assert.throws(()=>e.applyNativeEvent(state,event('accept',{driverId:'1',jobId:'j',at:now+26000}),rules(),true),/available/);
});
test('refusal clears No Fare, moves to tail, opens next offer immediately, and does not reoffer same job',()=>{
 let state=initial();state.drivers[0].noFare=true;e.startRound(state,'j',rules(),now);
 state=e.applyNativeEvent(state,event('reject',{jobId:'j',driverId:'1',at:now+1000}),rules(),true);assert.equal(state.drivers[0].noFare,false);assert.ok(state.drivers[0].queuedAt>state.drivers[4].queuedAt);assert.equal(state.rounds[0].offers[1].opensAt,now+1000);
 assert.equal(e.rankDrivers(state,state.jobs[0],rules(),now+2000,'zone_queue').some(d=>d.id==='1'),false);
 state=initial();state.drivers[0].noFare=true;e.startRound(state,'j',rules(),now);state=e.applyNativeEvent(state,event('tick',{at:now+60000}),rules(),true);assert.equal(state.drivers[0].noFare,false);assert.equal(state.rounds[0].offers[0].status,'expired');assert.deepEqual(state.jobs[0].excludedDriverIds,['1','2','3','4','5']);
});
test('accepted then client cancel earns portable No Fare; acceptance consumes it, second no fare restores, POB clears it',()=>{
 let state=initial();e.startRound(state,'j',rules(),now);state=e.applyNativeEvent(state,event('accept',{driverId:'1',jobId:'j'}),rules(),true);
 state=e.applyNativeEvent(state,event('client_cancel',{jobId:'j',at:now+1000}),rules(),true);assert.equal(state.drivers[0].noFare,true);assert.equal(state.jobs[0].status,'cancelled');
 // Existing No Fare driver in a destination zone remains ahead of a new arrival.
 const secondZone={...zone,id:'other',geometry:{type:'Polygon',coordinates:[[[-4,50.3],[-3.8,50.3],[-3.8,50.5],[-4,50.5],[-4,50.3]]]}};
 state.drivers[1]={...state.drivers[1],noFare:true,zoneId:'other',latitude:50.3755,longitude:-3.99};
 state=e.applyNativeEvent(state,event('gps',{driverId:'1',position:{latitude:50.3755,longitude:-3.99},available:true,at:now+2000}),rules(),true,[zone,secondZone]);
 state.jobs.push(job('j2',{zoneId:'other',longitude:-3.99}));assert.deepEqual(e.rankDrivers(state,state.jobs[1],rules(),now+2000,'zone_queue').map(d=>d.id),['2','1']);
 state.drivers[1].available=false;e.startRound(state,'j2',rules(),now+2000);state=e.applyNativeEvent(state,event('accept',{jobId:'j2',driverId:'1',at:now+2000}),rules(),true);assert.equal(state.drivers[0].noFare,false);
 state=e.applyNativeEvent(state,event('no_fare',{jobId:'j2',at:now+3000}),rules(),true);assert.equal(state.drivers[0].noFare,true);
 state.jobs.push(job('j3',{zoneId:'other',longitude:-3.99}));e.startRound(state,'j3',rules(),now+4000);state=e.applyNativeEvent(state,event('accept',{jobId:'j3',driverId:'1',at:now+4000}),rules(),true);state=e.applyNativeEvent(state,event('pob',{jobId:'j3',at:now+5000}),rules(),true);state=e.applyNativeEvent(state,event('client_cancel',{jobId:'j3',at:now+6000}),rules(),true);assert.equal(state.drivers[0].noFare,false);
});
test('nearest priority applies only to that driver’s closest eligible waiting job; cash-off disables immediately',()=>{
 const state=initial();state.drivers[4].noFare=true;state.jobs.push(job('closer',{longitude:state.drivers[4].longitude}));
 assert.equal(e.rankDrivers(state,state.jobs[0],rules(),now,'nearest')[0].id,'1');assert.equal(e.rankDrivers(state,state.jobs[1],rules(),now,'nearest')[0].id,'5');
 state.drivers[4].latitude=50.3756;state.jobs=state.jobs.slice(0,1);assert.equal(e.rankDrivers(state,state.jobs[0],rules(),now,'nearest')[0].id,'5');state.cashEnabled=false;assert.equal(e.rankDrivers(state,state.jobs[0],rules(),now,'nearest')[0].id,'1');
 const next=e.applyNativeEvent(state,event('tick'),rules(),false);assert.equal(next.drivers[4].noFare,false);assert.equal(e.effectiveNativeRules({},false).noFarePriority,false);
});
test('GPS assigns FIFO from published boundaries; stale GPS does not move queue and overlaps fail closed',()=>{
 let state=initial();const first=event('gps',{driverId:'new',position:{latitude:50.3755,longitude:-4.1427},available:true,at:now+2000});state=e.applyNativeEvent(state,first,rules(),true,[zone]);assert.equal(state.drivers[5].zoneId,'mutley');assert.equal(state.drivers[5].enteredAt,now+2000);assert.equal(e.applyNativeEvent(state,first,rules(),true,[zone]),state);
 state=e.applyNativeEvent(state,event('gps',{driverId:'new',position:{latitude:0,longitude:0},available:true,at:now+1000}),rules(),true,[zone]);assert.equal(state.drivers[5].zoneId,'mutley');assert.throws(()=>e.locateZone({latitude:50.3755,longitude:-4.1427},[zone,{...zone,id:'overlap'}]),/Overlapping/);
});
test('automatic switching is ordered, documented and has a manual fallback; stale or busy drivers excluded',()=>{
 const r=rules({control:'automatic',automaticRules:[{metric:'free_drivers',operator:'lt',threshold:2,method:'nearest'}]});assert.equal(e.chooseMethod(r,{free_drivers:1,pending_bookings:1}).method,'nearest');assert.equal(e.chooseMethod(r,{free_drivers:5,pending_bookings:1}).method,'zone_queue');
 const state=initial();state.drivers[0].gpsAt=now-121000;state.drivers[1].available=false;state.drivers[2].bookingId='another';state.jobs[0].eligibleDriverIds=['1','2','3','5'];assert.deepEqual(e.rankDrivers(state,state.jobs[0],r,now,'zone_queue').map(d=>d.id),['5']);
 const round=e.startRound(initial(),'j',rules({progressiveOffers:false}),now);assert.equal(round.offers.length,1);assert.equal(round.offers[0].expiresAt-now,60000);
});
