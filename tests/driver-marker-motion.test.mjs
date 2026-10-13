import assert from 'node:assert/strict';
import test from 'node:test';
import {cancelDriverMarkerMotion,createDriverMarkerMotion,moveDriverMarker,restoreDriverMarkerHeading} from '../app/admin/driver-marker-motion.ts';

test('fleet marker follows TaxiCRM interpolation and ignores an older position',()=>{
 const frames=new Map();let nextFrame=0;
 const originalRequest=globalThis.requestAnimationFrame;
 const originalCancel=globalThis.cancelAnimationFrame;
 const originalNow=globalThis.performance.now;
 globalThis.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id};
 globalThis.cancelAnimationFrame=id=>{frames.delete(id)};
 globalThis.performance.now=()=>0;
 try{
  const car={style:{transform:''}};
  let position=[50,-4];
  const marker={getElement:()=>({querySelector:()=>car}),setLatLng:next=>{position=[...next]}};
  const state=createDriverMarkerMotion([50,-4],'2026-10-13T13:00:00Z');
  moveDriverMarker(marker,state,[50.001,-4.001],'2026-10-13T13:00:05Z');
  assert.equal(frames.size,1);
  let [id,frame]=frames.entries().next().value;frames.delete(id);frame(2300);
  assert.ok(Math.abs(position[0]-50.0005)<1e-8);
  assert.ok(Math.abs(position[1]+4.0005)<1e-8);
  assert.match(car.style.transform,/rotate\(/);
  moveDriverMarker(marker,state,[51,-5],'2026-10-13T12:59:59Z');
  assert.equal(frames.size,1);
  [id,frame]=frames.entries().next().value;frames.delete(id);frame(4600);
  assert.deepEqual(position,[50.001,-4.001]);
  assert.equal(state.frame,null);
  restoreDriverMarkerHeading(marker,state);
  assert.match(car.style.transform,/rotate\(/);
  cancelDriverMarkerMotion(state);
  assert.equal(frames.size,0);
 }finally{
  globalThis.requestAnimationFrame=originalRequest;
  globalThis.cancelAnimationFrame=originalCancel;
  globalThis.performance.now=originalNow;
 }
});
