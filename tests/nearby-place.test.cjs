const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const moduleUnderTest={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('lib/nearby-place.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,moduleUnderTest,moduleUnderTest.exports);
const {closestNearbyPlace,inferredPlaceName}=moduleUnderTest.exports;

test('GPS lookup selects the closest useful named place within the pickup radius',()=>{
 const payload={elements:[
  {type:'node',lat:50.371108,lon:-4.142, tags:{name:'The Navy Inn',amenity:'pub'}},
  {type:'node',lat:50.371018,lon:-4.142, tags:{name:'Street parking',amenity:'parking'}},
  {type:'node',lat:50.372,lon:-4.142, tags:{name:'Distant Hotel',tourism:'hotel'}}
 ]};
 const place=closestNearbyPlace(payload,50.371,-4.142);
 assert.equal(place.name,'The Navy Inn');assert.equal(place.type,'pub');assert.ok(place.distanceMetres>=11&&place.distanceMetres<=13);
});

test('GPS lookup falls back to the street address when no useful place is nearby',()=>{
 const payload={elements:[{type:'node',lat:50.372,lon:-4.142,tags:{name:'Far Cafe',amenity:'cafe'}}]};
 assert.equal(closestNearbyPlace(payload,50.371,-4.142),null);
});

test('GPS lookup understands Photon places and ignores named roads',()=>{
 const payload={features:[
  {properties:{name:'Southside Street',osm_key:'highway',osm_value:'residential'},geometry:{coordinates:[-4.142,50.37101]}},
  {properties:{name:'The Navy Inn',osm_key:'amenity',osm_value:'pub'},geometry:{coordinates:[-4.142,50.371108]}}
 ]};
 assert.equal(closestNearbyPlace(payload,50.371,-4.142).name,'The Navy Inn');
});

test('GPS lookup accepts a named Nominatim feature as a resilient fallback',()=>{
 const payload={name:'The Navy Inn',category:'amenity',type:'pub',lat:'50.371108',lon:'-4.142'};
 assert.equal(closestNearbyPlace(payload,50.371,-4.142).name,'The Navy Inn');
});

test('Autocab labels distinguish a place name from an ordinary street address',()=>{
 assert.equal(inferredPlaceName('The Navy Inn, Southside Street, Plymouth'),'The Navy Inn');assert.equal(inferredPlaceName('Former House of Frasier, 40, Royal Parade, Plymouth'),'Former House of Frasier');assert.equal(inferredPlaceName('44 Devonport Road, Plymouth'),null);assert.equal(inferredPlaceName('Southside Street, Plymouth'),null);
});

test('current-address route requests nearby places only for the GPS pickup flow',async()=>{
 const calls=[],route={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/api/address/current/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='zod'?require(id):id==='@/lib/autocab-api'?{addressAtCoordinates:async(...args)=>{calls.push(args);return{text:args[3]?'The Navy Inn':'44 Devonport Road',id:'pickup',...(args[3]?{nearbyPlace:{name:'The Navy Inn',distanceMetres:12}}:{})}},AutocabApiError:class extends Error{},AutocabConfigurationError:class extends Error{}}:id==='@/lib/security'?{unavailable:error=>{throw error}}:require(id),route,route.exports);
 const gps=await route.exports.GET(new Request('https://example.test/api/address/current?latitude=50.371&longitude=-4.142&nearby=1')),plain=await route.exports.GET(new Request('https://example.test/api/address/current?latitude=50.371&longitude=-4.142'));
 assert.deepEqual(calls,[[50.371,-4.142,1,true],[50.371,-4.142,1,false]]);assert.equal(gps.headers.get('x-pickup-lookup'),'nearby-v2');assert.equal((await gps.json()).match.kind,'place');assert.equal((await plain.json()).match.kind,'address');
});
