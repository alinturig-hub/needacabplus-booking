import {test} from 'node:test';
import assert from 'node:assert/strict';
import {journeyTiming,nearbyCars} from '../lib/journey-timing';
const now=Date.parse('2026-10-17T14:00:00Z');
test('pickup travel time and trip duration determine estimated arrival in UK time',()=>{
 assert.deepEqual(journeyTiming({pickupSeconds:301,tripSeconds:1200,sampledAt:now,now}),{pickupMinutes:6,pickupTime:null,arrivalTime:'15:26',tripMinutes:20});
});
test('missing or stale availability never invents an arrival time',()=>{
 for(const input of [{pickupSeconds:null,sampledAt:now},{pickupSeconds:300,sampledAt:now-91000}]){
  const timing=journeyTiming({...input,tripSeconds:1200,now});assert.equal(timing.pickupMinutes,null);assert.equal(timing.arrivalTime,null);
 }
 assert.equal(journeyTiming({pickupSeconds:300,sampledAt:now,tripSeconds:null,now}).arrivalTime,null);
});
test('scheduled arrival uses scheduled pickup and handles GMT after the clock change',()=>{
 const timing=journeyTiming({pickupSeconds:300,tripSeconds:1200,sampledAt:now,now,scheduledAt:'2026-10-26T14:00:00Z'});
 assert.deepEqual(timing,{pickupMinutes:null,pickupTime:'14:00',arrivalTime:'14:20',tripMinutes:20});
});
test('nearby candidates exclude stale, future and invalid locations and keep nearest three',()=>{
 const car=(id:string,lat:number,at=now)=>({id,latitude:lat,longitude:-4.14,recordedAt:new Date(at).toISOString()});
 const selected=nearbyCars([car('stale',50.37,now-121000),car('future',50.37,now+31000),car('invalid',100),car('far',51),car('c',50.4),car('b',50.38),car('a',50.37)],{latitude:50.37,longitude:-4.14},now);
 assert.deepEqual(selected.map(c=>c.id),['a','b','c']);
});
