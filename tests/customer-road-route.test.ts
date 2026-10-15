import assert from 'node:assert/strict';
import test from 'node:test';
import {customerRoadRoute,customerRoadRouteDetails} from '../lib/customer-road-route';

test('road route details include distance used by tariff tests',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({code:'Ok',routes:[{distance:8046.72,duration:900,geometry:{coordinates:[[-4.14,50.37],[-4.12,50.39]]}}]});
 try{
  const points=[{latitude:50.37,longitude:-4.14},{latitude:50.39,longitude:-4.12}];
  const details=await customerRoadRouteDetails(points);
  assert.equal(details.distanceMetres,8046.72);
  assert.equal(details.durationSeconds,900);
  assert.deepEqual(await customerRoadRoute(points),details.coordinates);
 }finally{globalThis.fetch=original}
});

test('road route rejects missing distance',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({code:'Ok',routes:[{geometry:{coordinates:[[-4.14,50.37],[-4.12,50.39]]}}]});
 try{
  const points=[{latitude:50.37,longitude:-4.14},{latitude:50.39,longitude:-4.12}];
  await assert.rejects(customerRoadRouteDetails(points),/could not be calculated/);
  assert.equal((await customerRoadRoute(points)).length,2);
 }finally{globalThis.fetch=original}
});
