import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateDispatch,simulationDefaults,dispatchEventKind} from '../lib/dispatch-simulation.ts';
const due=Date.UTC(2030,0,1,15),now=due-60*60000;
const cars=[{vehicleId:'1',label:'Near',etaSeconds:600},{vehicleId:'2',label:'Backup',etaSeconds:1080}];
test('backup allowance includes both acceptance windows and buffer, not just midpoint',()=>{
 const p=simulateDispatch(due,now,cars,simulationDefaults);
 assert.equal(p.midpointSeconds,840);
 assert.equal(p.targetAt,due-5*60000);
 assert.equal(p.dispatchAt,p.targetAt-(1080+50+120)*1000);
 assert.equal(p.recommended.vehicleId,'1');
});
test('rejection excludes a candidate; acceptance stops further recommendations',()=>{
 assert.equal(simulateDispatch(due,now,cars,simulationDefaults,['1']).recommended.vehicleId,'2');
 assert.equal(simulateDispatch(due,now,cars,simulationDefaults,[],'1').recommended,null);
 assert.equal(simulateDispatch(due,now,cars,simulationDefaults,[],'1').state,'accepted');
});
test('far, invalid and duplicate candidates cannot distort the backup margin',()=>{
 const p=simulateDispatch(due,now,[...cars,cars[0],{vehicleId:'3',label:'Far',etaSeconds:9000},{vehicleId:'4',label:'Invalid',etaSeconds:NaN}],simulationDefaults);
 assert.equal(p.candidates.length,2);
 assert.equal(p.midpointSeconds,840);
});
test('no candidates and insufficient time are explicit outcomes',()=>{
 assert.equal(simulateDispatch(due,now,[],simulationDefaults).state,'unavailable');
 assert.equal(simulateDispatch(due,due-60000,cars,simulationDefaults).state,'at-risk');
 assert.throws(()=>simulateDispatch(NaN,now,cars,simulationDefaults));
});
test('dispatch and acceptance events are distinct',()=>{
 assert.equal(dispatchEventKind('BookingDispatchAccepted'),'accepted');
 assert.equal(dispatchEventKind('booking_accepted'),'accepted');
 assert.equal(dispatchEventKind('booking_dispatch'),'offered');
 assert.equal(dispatchEventKind('booking_rejected'),'rejected');
 assert.equal(dispatchEventKind('BookingCreated'),null);
});
