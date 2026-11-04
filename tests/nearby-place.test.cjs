const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const moduleUnderTest={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('lib/nearby-place.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='./map-settings'?{readMapConfiguration:async()=>({settings:{searchProvider:'openstreetmap'},apiKey:''})}:id==='./maptiler-geocoding'?{nearestMapTilerPlace:()=>null,reverseMapTilerPlaces:async()=>[]}:require(id),moduleUnderTest,moduleUnderTest.exports);
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
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/api/address/current/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='zod'?require(id):id==='@/lib/autocab-api'?{addressAtCoordinates:async(...args)=>{calls.push(args);return{text:args[3]?'The Navy Inn, Southside Street, Plymouth':'44 Devonport Road, Plymouth',id:'pickup'}},AutocabApiError:class extends Error{},AutocabConfigurationError:class extends Error{}}:id==='@/lib/nearby-place'?{inferredPlaceName}:id==='@/lib/security'?{unavailable:error=>{throw error}}:require(id),route,route.exports);
 const gps=await route.exports.GET(new Request('https://example.test/api/address/current?latitude=50.371&longitude=-4.142&nearby=1')),plain=await route.exports.GET(new Request('https://example.test/api/address/current?latitude=50.371&longitude=-4.142'));
 assert.deepEqual(calls,[[50.371,-4.142,1,true],[50.371,-4.142,1,false]]);assert.equal(gps.headers.get('x-pickup-lookup'),'nearby-v5');assert.equal((await gps.json()).match.kind,'place');assert.equal((await plain.json()).match.kind,'address');
});

test('a large named warehouse is nearby by its footprint rather than its distant centre',()=>{
 const warehouse={elements:[{type:'way',tags:{name:'Amazon Centre',building:'warehouse'},geometry:[{lat:50.37,lon:-4.15},{lat:50.37,lon:-4.14},{lat:50.375,lon:-4.14},{lat:50.375,lon:-4.15},{lat:50.37,lon:-4.15}]}]};
 const inside=closestNearbyPlace(warehouse,50.3701,-4.1499,60);assert.equal(inside.name,'Amazon Centre');assert.equal(inside.distanceMetres,0);
 const nearGate=closestNearbyPlace(warehouse,50.3699,-4.1499,60);assert.equal(nearGate.name,'Amazon Centre');assert.ok(nearGate.distanceMetres>=10&&nearGate.distanceMetres<=12);
 assert.equal(closestNearbyPlace(warehouse,50.369,-4.1499,60),null);
});
test('open geometry does not invent a closing edge close to the customer',()=>{
 const line={elements:[{type:'way',tags:{name:'Industrial facility',industrial:'warehouse'},geometry:[{lat:50.37,lon:-4.15},{lat:50.375,lon:-4.15},{lat:50.375,lon:-4.14}]}]};
 assert.equal(closestNearbyPlace(line,50.3725,-4.145,60),null);
});
test('empty MapTiler POIs still use fallback providers and return named nearby alternatives',async()=>{
 const mod={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('lib/nearby-place.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='./map-settings'?{readMapConfiguration:async()=>({settings:{searchProvider:'maptiler',nearbyPlaceRadiusMetres:60},apiKey:'synthetic-key'})}:id==='./maptiler-geocoding'?{reverseMapTilerPlaces:async()=>[],nearestMapTilerPlace:()=>null}:require(id),mod,mod.exports);
 const original=global.fetch,calls=[];global.fetch=async(url)=>{calls.push(String(url));return Response.json(String(url).includes('overpass')?{elements:[{lat:50.3711,lon:-4.142,tags:{name:'Amazon Centre',building:'warehouse'}},{lat:50.3712,lon:-4.142,tags:{name:'Nearby cafe',amenity:'cafe'}}]}:{features:[]});};
 try{const place=await mod.exports.nearbyNamedPlace(50.371,-4.142);assert.equal(place.name,'Amazon Centre');assert.equal(place.alternatives.length,2);assert.ok(calls.some(url=>url.includes('overpass')));}finally{global.fetch=original;}
});

test('exact GPS mode retains the original street and exact point while exposing nearby places',async()=>{
 const route={exports:{}},point={latitude:50.41661234,longitude:-4.11391234};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/api/address/current/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='zod'?require(id):id==='@/lib/autocab-api'?{addressAtCoordinates:async()=>({text:'Amazon Centre, Thornbury Road',originalAddressText:'Thornbury Road, Plymouth',coordinate:{latitude:50.42,longitude:-4.12},zoneId:1,nearbyPlace:{name:'Amazon Centre',distanceMetres:18,alternatives:[{name:'Amazon Centre',distanceMetres:18}]}}),AutocabApiError:class extends Error{},AutocabConfigurationError:class extends Error{}}:id==='@/lib/nearby-place'?{inferredPlaceName}:id==='@/lib/security'?{unavailable:error=>{throw error}}:require(id),route,route.exports);
 const url=`https://example.test/api/address/current?latitude=${point.latitude}&longitude=${point.longitude}&nearby=1`;
 const exact=await (await route.exports.GET(new Request(url+'&exact=1'))).json();assert.equal(exact.item.address,'Thornbury Road, Plymouth');assert.deepEqual(exact.item.fullAddress.coordinate,point);assert.equal(exact.nearbyPlaces[0].name,'Amazon Centre');
 const legacy=await (await route.exports.GET(new Request(url))).json();assert.equal(legacy.item.address,'Amazon Centre, Thornbury Road');assert.deepEqual(legacy.item.fullAddress.coordinate,{latitude:50.42,longitude:-4.12});
});
