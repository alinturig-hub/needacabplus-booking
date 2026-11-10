import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadTomtomTraffic,tomtomItem} from '../lib/traffic/tomtom';
import {retainTraffic,visibleTraffic,trafficSource} from '../lib/traffic/presentation';
import type {TrafficSnapshot} from '../lib/traffic/types';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const now=Date.parse('2026-11-10T12:00:00Z');
function fixture(){return {geometry:{type:'LineString',coordinates:[[-4.15,50.38],[-4.14,50.39]]},properties:{id:'synthetic-1',iconCategory:8,from:'Synthetic Road',to:'Test Street',startTime:'2026-11-10T09:00:00Z',endTime:'2026-11-10T18:00:00Z',events:[{description:'Closed',iconCategory:8}],delay:0,length:120}};}
test('TomTom keeps longitude/latitude geometry and reports actual time validity',()=>{
 const input=fixture(),item=tomtomItem(input,now)!;assert.ok(item);assert.equal(item.source,'tomtom');assert.equal(item.state,'in_progress');assert.deepEqual(item.geometry,input.geometry);assert.deepEqual(item.bounds,[-4.15,50.38,-4.14,50.39]);assert.equal(item.details.find(d=>d.label==='Reported delay')?.value,'0 seconds');
 assert.equal(tomtomItem(input,Date.parse('2026-11-10T19:00:00Z'))?.state,'ended');
 assert.equal(tomtomItem(input,Date.parse('2026-11-10T08:00:00Z'))?.state,'planned');
 assert.equal(tomtomItem({...input,geometry:{type:'Point',coordinates:[2.3,48.8]}},now),null);
 assert.equal(tomtomItem({...input,geometry:{type:'LineString',coordinates:[[-4.15,NaN]]}},now),null);
 assert.equal(tomtomItem({...input,properties:{...input.properties,startTime:'invalid'}} ,now)?.details.find(d=>d.label==='Start')?.value,null);
});
test('TomTom calls the fixed Plymouth endpoint without shared caching and excludes credentials',async()=>{
 const key='synthetic-secret';let calls=0;
 const fetcher:typeof fetch=async(url,options)=>{
  calls++;const u=new URL(String(url));assert.equal(u.origin,'https://api.tomtom.com');assert.equal(u.searchParams.get('bbox'),'-4.25,50.32,-4.02,50.46');assert.equal(u.searchParams.get('timeValidityFilter'),'present');assert.equal(u.searchParams.get('key'),key);assert.equal(options?.cache,'no-store');assert.equal(options?.redirect,'error');
  return Response.json({incidents:[fixture(),fixture(),{geometry:{type:'bad'}}]});
 };
 const result=await loadTomtomTraffic({key,fetcher,now});assert.equal(calls,1);assert.equal(result.status,'ok');assert.equal(result.items.length,1);assert.equal(result.total,3);assert.equal(result.omitted,2);assert.ok(!JSON.stringify(result).includes(key));
});
test('missing keys, forbidden requests, provider limits and malformed bodies fail independently and safely',async()=>{
 assert.equal((await loadTomtomTraffic({key:'',now})).status,'not_configured');
 for(const status of [403,429,500]){
  const result=await loadTomtomTraffic({key:'synthetic-secret',now,fetcher:async()=>new Response('synthetic-secret',{status,headers:{'retry-after':'300'}})});
  assert.equal(result.status,'unavailable');assert.deepEqual(result.items,[]);assert.ok(!JSON.stringify(result).includes('synthetic-secret'));if(status===429)assert.equal(result.retryAfterSeconds,300);
 }
 assert.equal((await loadTomtomTraffic({key:'x',fetcher:async()=>Response.json({error:'bad'}),now})).status,'unavailable');
 assert.equal((await loadTomtomTraffic({key:'x',fetcher:async()=>{throw Error('secret url')},now})).status,'unavailable');
});
function snapshot():TrafficSnapshot{
 const item=tomtomItem(fixture(),now)!;
 return {checkedAt:new Date(now).toISOString(),refreshSeconds:120,bounds:[],street:{status:'ok',checkedAt:'2026-11-10T12:00:00Z',error:null,items:[{...item,id:'PERMIT:synthetic',source:'webhook'}],total:1,omitted:0},tomtom:{status:'ok',checkedAt:'2026-11-10T12:00:00Z',error:null,items:[item],total:1,omitted:0}};
}
test('a failed source retains explicitly stale records while the other source updates; recovery removes stale data',()=>{
 const previous=snapshot(),next=snapshot();next.tomtom={...next.tomtom,status:'unavailable',checkedAt:'2026-11-10T12:02:00Z',items:[],error:'Unavailable'};
 const partial=retainTraffic(previous,next);assert.equal(partial.tomtom.items.length,1);assert.equal(partial.tomtom.retainedAt,previous.tomtom.checkedAt);assert.equal(partial.street.retainedAt,undefined);
 const empty=snapshot();empty.tomtom.items=[];assert.equal(retainTraffic(partial,empty).tomtom.items.length,0);assert.equal(retainTraffic(partial,empty).tomtom.retainedAt,undefined);
});
test('map filters preserve separate overlapping sources and distinguish historical records',()=>{
 const data=snapshot(),items=[...data.street.items,...data.tomtom.items];
 items.push({...items[0],id:'ARCHIVE:synthetic',source:'archive',state:'unknown'});
 assert.equal(visibleTraffic(items,'all','current','all','').length,2);
 assert.equal(visibleTraffic(items,'all','all','all','').length,3);
 assert.equal(visibleTraffic(items,'tomtom','all','closure','Synthetic Road').length,1);
 assert.equal(visibleTraffic(items,'street','all','all','').length,2);
 assert.equal(visibleTraffic(items,'tomtom','all','congestion','').length,0);
 assert.equal(trafficSource(items[2]),'Street Manager archive');
});
test('combined API requires Admin before requesting either source and returns independent source failures',async()=>{
 let authorized=false,queries=0,providerCalls=0,streetFails=false,released=0;
 const routeModule={exports:{} as {GET:()=>Promise<Response>}};
 const client={query:async()=>{queries++;return {rows:[]}},release:()=>{released++}};
 const requireMock=(id:string)=>{
  if(id==='@/lib/security')return {isAdmin:async()=>authorized};
  if(id==='@/lib/database')return {database:()=>({connect:async()=>client})};
  if(id==='@/lib/street-manager/preview-data')return {loadStreetPreview:async()=>{if(streetFails)throw Error('private database error');return {items:[],totalObjects:0,limited:false,lastReceipt:'2026-11-10T11:59:00Z'}}};
  if(id==='@/lib/traffic/tomtom')return {loadTomtomTraffic:async()=>{providerCalls++;return snapshot().tomtom},trafficBounds:[],trafficRefreshSeconds:120};
  throw Error('Unexpected import');
 };
 const code=ts.transpileModule(readFileSync('app/api/admin/traffic/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(requireMock,routeModule,routeModule.exports);
 assert.equal((await routeModule.exports.GET()).status,403);assert.equal(queries,0);assert.equal(providerCalls,0);
 authorized=true;streetFails=true;const response=await routeModule.exports.GET(),body=await response.json();assert.equal(response.status,200);assert.equal(body.street.status,'unavailable');assert.equal(body.tomtom.status,'ok');assert.equal(released,1);assert.ok(!JSON.stringify(body).includes('private database error'));assert.match(response.headers.get('cache-control')||'',/no-store/);
});
