import test from 'node:test';
import assert from 'node:assert/strict';
const memory=new Map<string,string>();
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,v)}});
async function fresh(getCurrentPosition:unknown){memory.clear();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition}}});return import(`../lib/browser-location.ts?case=${Math.random()}`);}
test('login and guest share one request and in-memory result without persisting coordinates',async()=>{
 let calls=0;let success:(x:unknown)=>void=()=>{};
 const m=await fresh((ok:(x:unknown)=>void)=>{calls++;success=ok});
 const a=m.requestInitialLocation(),b=m.requestInitialLocation();assert.equal(calls,1);
 success({coords:{latitude:50.37,longitude:-4.14}});assert.deepEqual(await a,{latitude:50.37,longitude:-4.14});assert.deepEqual(await b,await a);
 await m.requestInitialLocation();assert.equal(calls,1);assert.deepEqual([...memory.values()],['granted']);
});
test('denial keeps manual booking available and does not repeatedly prompt',async()=>{
 let calls=0;const m=await fresh((_ok:unknown,fail:(x:unknown)=>void)=>{calls++;fail({code:1})});assert.equal(await m.requestInitialLocation(),null);assert.equal(await m.requestInitialLocation(),null);assert.equal(calls,1);assert.equal(memory.get('nac-initial-location-outcome'),'denied');
});
test('timeout, thrown browser errors, and invalid coordinates fail without rejection',async()=>{
 for(const fn of [(_ok:unknown,fail:(x:unknown)=>void)=>fail({code:3}),()=>{throw Error('blocked')},(ok:(x:unknown)=>void)=>ok({coords:{latitude:999,longitude:0}})]) {const m=await fresh(fn);assert.equal(await m.requestInitialLocation(),null);}
});
test('unsupported geolocation returns null',async()=>{const m=await fresh(null);Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});assert.equal(await m.requestInitialLocation(),null);});
