import test from 'node:test';import assert from 'node:assert/strict';
import {watchForegroundLocation} from '../lib/live-location';
test('fresh foreground tracking updates position, pauses when hidden and cleans up safely',()=>{
 const doc=new EventTarget() as EventTarget&{visibilityState:string};doc.visibilityState='visible';
 const updates:unknown[]=[],cleared:number[]=[],callbacks:((x:unknown)=>void)[]=[],failures:(()=>void)[]=[],options:unknown[]=[];
 const oldDoc=Object.getOwnPropertyDescriptor(globalThis,'document'),oldNav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc});Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{watchPosition:(ok:(x:unknown)=>void,fail:()=>void,opts:unknown)=>{callbacks.push(ok);failures.push(fail);options.push(opts);return callbacks.length},clearWatch:(id:number)=>cleared.push(id)}}});
 try{
  const stop=watchForegroundLocation(point=>updates.push(point));assert.deepEqual(options[0],{enableHighAccuracy:true,maximumAge:0,timeout:12000});
  callbacks[0]({coords:{latitude:50.37,longitude:-4.14}});callbacks[0]({coords:{latitude:50.38,longitude:-4.15}});assert.equal(updates.length,2);
  doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));assert.deepEqual(cleared,[1]);assert.equal(updates.at(-1),null);
  const count=updates.length;callbacks[0]({coords:{latitude:0,longitude:0}});assert.equal(updates.length,count);
  doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));assert.equal(callbacks.length,2);failures[1]();assert.equal(updates.at(-1),null);
  stop();assert.deepEqual(cleared,[1,2]);callbacks[1]({coords:{latitude:0,longitude:0}});assert.equal(updates.at(-1),null);
 }finally{if(oldDoc)Object.defineProperty(globalThis,'document',oldDoc);else Reflect.deleteProperty(globalThis,'document');if(oldNav)Object.defineProperty(globalThis,'navigator',oldNav);else Reflect.deleteProperty(globalThis,'navigator')}
});
