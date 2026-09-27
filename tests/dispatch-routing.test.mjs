import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roadDurations,validPoint,milesBetween,trackEstimate} from '../lib/dispatch-routing.ts';
test('routing preserves unreachable results and sends longitude before latitude',async()=>{
 const previous=process.env.DISPATCH_OSRM_URL,original=globalThis.fetch;
 process.env.DISPATCH_OSRM_URL='https://routing.example';
 globalThis.fetch=async url=>{
  assert.equal(url.pathname,'/table/v1/driving/-4,50;-4.1,50.1;-4.2,50.2');
  assert.equal(url.searchParams.get('destinations'),'2');
  assert.equal(url.searchParams.get('sources'),'0;1');
  return Response.json({code:'Ok',durations:[[600],[null]]});
 };
 try{assert.deepEqual(await roadDurations([{latitude:50,longitude:-4},{latitude:50.1,longitude:-4.1}],{latitude:50.2,longitude:-4.2}),[600,null])}finally{globalThis.fetch=original;if(previous===undefined)delete process.env.DISPATCH_OSRM_URL;else process.env.DISPATCH_OSRM_URL=previous}
});
test('track estimates use sufficient moving samples and label stationary fallback',()=>{
 const source={latitude:50,longitude:-4},destination={latitude:50.05,longitude:-4};
 const stationary=[0,1,2,3].map(i=>({...source,at:i*30000}));
 const fallback=trackEstimate(source,destination,stationary,18,1.4);
 assert.equal(fallback.basis,'configured speed');assert.equal(fallback.speedMph,18);
 assert.ok(fallback.etaSeconds>0);
 const moving=[0,1,2,3].map(i=>({latitude:50+i*0.002,longitude:-4,at:i*30000}));
 const observed=trackEstimate(source,destination,moving,18,1.4);
 assert.equal(observed.basis,'recent moving tracks');assert.equal(observed.sampleCount,3);
 assert.ok(observed.speedMph>=8&&observed.speedMph<=30);
 assert.throws(()=>trackEstimate(source,destination,[],0,1.4));
});
test('missing routing never invents an ETA',async()=>{
 const previous=process.env.DISPATCH_OSRM_URL;delete process.env.DISPATCH_OSRM_URL;
 try{await assert.rejects(roadDurations([{latitude:50,longitude:-4}],{latitude:51,longitude:-4}),/not configured/)}finally{if(previous!==undefined)process.env.DISPATCH_OSRM_URL=previous}
 assert.equal(validPoint({latitude:NaN,longitude:0}),false);
 assert.equal(validPoint({latitude:100,longitude:0}),false);
 assert.equal(milesBetween({latitude:50,longitude:-4},{latitude:50,longitude:-4}),0);
});
