import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closureAwareRoute,routeConflicts,NoVerifiedRoute,type RouteCandidate,type RouteClosure} from '../lib/routing/closure-aware';
const start={latitude:50.38,longitude:-4.15},end={latitude:50.38,longitude:-4.13},now=Date.parse('2026-11-11T10:00:00Z');
const closure:RouteClosure={id:'closed',street:'Test Road',geometry:{type:'LineString',coordinates:[[-4.14,50.3799],[-4.14,50.3801]]},startsAt:now-1000,endsAt:now+3600000};
const direct:RouteCandidate={coordinates:[[-4.15,50.38],[-4.13,50.38]],distanceMetres:1500,durationSeconds:180};
const detour:RouteCandidate={coordinates:[[-4.15,50.38],[-4.15,50.385],[-4.13,50.385],[-4.13,50.38]],distanceMetres:2500,durationSeconds:300};
test('detects narrow mid-segment crossings even when both endpoints are far away',()=>assert.deepEqual(routeConflicts(direct,[closure],now),['closed']));
test('ignores expired closures but checks a closure starting during travel',()=>{assert.deepEqual(routeConflicts(direct,[{...closure,endsAt:now-1}],now),[]);assert.deepEqual(routeConflicts(direct,[{...closure,startsAt:now+60000}],now),['closed']);});
test('selects the quickest verified provider alternative, not the blocked fastest',async()=>{const r=await closureAwareRoute([start,end],[closure],now,async()=>[direct,{...detour,durationSeconds:500},detour]);assert.equal(r.durationSeconds,300);assert.equal(r.requests,1);assert.equal(r.liveTrafficSpeeds,false)});
test('rechecks generated waypoint routes and never returns a blocked fallback',async()=>{let calls=0;await assert.rejects(closureAwareRoute([start,end],[closure],now,async()=>{calls++;return [direct]}),NoVerifiedRoute);assert.equal(calls,9)});
test('tries waypoints then returns a route only after geometric verification',async()=>{let calls=0;const r=await closureAwareRoute([start,end],[closure],now,async()=>++calls===1?[direct]:[detour]);assert.equal(r.requests,2);assert.deepEqual(r.avoidedClosureIds,['closed'])});
test('keeps mandatory vias and carries elapsed time to subsequent legs',async()=>{const middle={latitude:50.38,longitude:-4.14};const seen:unknown[]=[];const r=await closureAwareRoute([start,middle,end],[],now,async p=>{seen.push(p);return [{coordinates:p.map(x=>[x.longitude,x.latitude]),distanceMetres:700,durationSeconds:60}]});assert.equal(r.durationSeconds,120);assert.equal(seen.length,2);assert.deepEqual(r.coordinates,[[-4.15,50.38],[-4.14,50.38],[-4.13,50.38]])});
test('rejects a provider snapping the pickup far away and invalid coordinates',async()=>{await assert.rejects(closureAwareRoute([start,end],[],now,async()=>[{...direct,coordinates:[[-4.16,50.38],[-4.13,50.38]]}]),NoVerifiedRoute);await assert.rejects(closureAwareRoute([{latitude:NaN,longitude:0},end],[],now,async()=>[direct]));});
test('rejects an alternative that encounters a second closure',async()=>{const second={...closure,id:'second',geometry:{type:'Point' as const,coordinates:[-4.14,50.385]}};await assert.rejects(closureAwareRoute([start,end],[closure,second],now,async()=>[direct,detour]),NoVerifiedRoute)});

test('OSRM adapter rejects malformed provider geometry and respects a fixed host',async()=>{
 const {osrmProvider}=await import('../lib/routing/osrm');let requested='';
 const provider=osrmProvider('http://routing.internal:5000',async url=>{requested=String(url);return Response.json({code:'Ok',routes:[{distance:100,duration:60,geometry:{coordinates:[[null,50],[-4.13,50.38]]}},{distance:1500,duration:180,geometry:{coordinates:direct.coordinates}}]})});
 const result=await provider([start,end]);assert.equal(result.length,1);assert.equal(new URL(requested).hostname,'routing.internal');assert.equal(new URL(requested).searchParams.get('alternatives'),'3');
});
test('source loader requires current Council success and does not fetch TomTom',async()=>{
 const {storedClosures}=await import('../lib/routing/stored-closures');const queries:string[]=[];
 const client={query:async(sql:string)=>{queries.push(sql);return {rows:sql.includes('source_runs')?[{status:'error',last_success_at:new Date(now)}]:[]}}};
 const result=await storedClosures(client as never,now);assert.equal(result.coverage.council,'unavailable_or_stale');assert.equal(result.coverage.tomtom,'not_available_as_stored_feed');assert.equal(queries.length,2);assert.deepEqual(result.closures,[]);
});
test('endpoints inside a closure never cause an unchecked route to be returned',async()=>{
 const atPickup={...closure,id:'pickup',geometry:{type:'Point' as const,coordinates:[start.longitude,start.latitude]}};
 await assert.rejects(closureAwareRoute([start,end],[atPickup],now,async()=>[direct,detour]),NoVerifiedRoute);
});
