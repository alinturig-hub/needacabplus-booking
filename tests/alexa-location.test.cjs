const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id in mocks?mocks[id]:require(id),module,module.exports);return module.exports;}
const quote=load('lib/alexa/autocab-quote.ts',{'../autocab-api':{},'../integration-control':{}});
const {suggestAlexaPickup,parseTaxiJourney,GEO_SCOPE}=load('lib/alexa/location.ts',{'../autocab-api':{},'./autocab-quote':quote,'./guest-search':{}});
const point={text:'Synthetic Cafe, Plymouth',town:'Plymouth',coordinate:{latitude:50.38,longitude:-4.14},zoneId:1};
function device(){return {System:{apiEndpoint:'https://api.eu.amazonalexa.com',apiAccessToken:'synthetic-private-token',device:{deviceId:'synthetic-device-id',supportedInterfaces:{}}}};}
function mobile(){const c=device();c.System.device.supportedInterfaces.Geolocation={};c.System.user={permissions:{scopes:{[GEO_SCOPE]:{status:'GRANTED'}}}};c.Geolocation={timestamp:new Date().toISOString(),coordinate:{latitudeInDegrees:50.39,longitudeInDegrees:-4.15,accuracyInMeters:15},locationServices:{access:'ENABLED',status:'RUNNING'}};return c;}
test('Echo address API is called on its exact Amazon origin and candidate is labelled device address',async()=>{
 let calls=0;const result=await suggestAlexaPickup(device(),{fetcher:async(url,init)=>{calls++;assert.equal(String(url),'https://api.eu.amazonalexa.com/v1/devices/synthetic-device-id/settings/address');assert.equal(init.headers.Authorization,'Bearer synthetic-private-token');assert.equal(init.redirect,'error');return Response.json({addressLine1:'67 Synthetic Road',city:'Plymouth',postalCode:'PL4 1AA',countryCode:'GB'})},address:async(text,opts)=>{assert.match(text,/67 Synthetic Road/);assert.equal(opts.city,'Plymouth');return [point]}});assert.equal(calls,1);assert.equal(result.source,'device');assert.equal(result.city,'Plymouth');assert.equal(JSON.stringify(result).includes('synthetic-private-token'),false);
});
test('untrusted origins, redirects, denied permission and incomplete device addresses yield manual fallback',async()=>{
 let calls=0;const c=device();c.System.apiEndpoint='https://api.eu.amazonalexa.com.attacker.test';assert.equal(await suggestAlexaPickup(c,{fetcher:async()=>{calls++;throw Error('must not call')}}),null);assert.equal(calls,0);
 for(const status of [302,401,403,500])assert.equal(await suggestAlexaPickup(device(),{fetcher:async()=>new Response('',{status})}),null);
 assert.equal(await suggestAlexaPickup(device(),{fetcher:async()=>Response.json({postalCode:'PL4 1AA',countryCode:'GB'})}),null);
});
test('fresh permitted GPS uses actual measured coordinates and never reads the registered home',async()=>{
 let fetches=0;const result=await suggestAlexaPickup(mobile(),{fetcher:async()=>{fetches++;throw Error('home lookup forbidden')},reverse:async(lat,lon)=>{assert.equal(lat,50.39);assert.equal(lon,-4.15);return point}});assert.equal(result.source,'gps');assert.equal(result.address.coordinate.latitude,50.39);assert.equal(result.address.coordinate.longitude,-4.15);assert.equal(fetches,0);
});
test('stale, inaccurate, future, disabled and unconsented mobile GPS never falls back to home',async()=>{
 let fetches=0,reverses=0;const variants=[];
 const stale=mobile();stale.Geolocation.timestamp=new Date(Date.now()-120000).toISOString();variants.push(stale);
 const future=mobile();future.Geolocation.timestamp=new Date(Date.now()+120000).toISOString();variants.push(future);
 const inaccurate=mobile();inaccurate.Geolocation.coordinate.accuracyInMeters=500;variants.push(inaccurate);
 const denied=mobile();denied.System.user.permissions.scopes[GEO_SCOPE].status='DENIED';variants.push(denied);
 const disabled=mobile();disabled.Geolocation.locationServices.access='DISABLED';variants.push(disabled);
 const absent=mobile();delete absent.Geolocation;variants.push(absent);
 for(const c of variants)assert.equal(await suggestAlexaPickup(c,{fetcher:async()=>{fetches++;throw Error('forbidden')},reverse:async()=>{reverses++;return point}}),null);
 assert.equal(fetches,0);assert.equal(reverses,0);
});
test('a saved address with multiple matches is never substituted silently',async()=>{
 const r=await suggestAlexaPickup(device(),{fetcher:async()=>Response.json({addressLine1:'67 Synthetic Road',city:'Plymouth',postalCode:'PL4 1AA',countryCode:'GB'}),address:async()=>[point,{...point,text:'Other address'}]});assert.equal(r,null);
});
test('read-only location timeout returns fallback without blocking voice indefinitely',async()=>{const c=mobile();assert.equal(await suggestAlexaPickup(c,{budgetMs:10,reverse:async()=>new Promise(()=>{})}),null)});
test('one phrase holds both endpoints or destination only without conflating them',()=>{
 assert.deepEqual(parseTaxiJourney('from Crowne Plaza to the train station'),{pickup:'Crowne Plaza',destination:'the train station'});
 assert.deepEqual(parseTaxiJourney('to the train station'),{destination:'the train station'});
 assert.deepEqual(parseTaxiJourney('from here to the station'),{destination:'the station'});
 for(const text of ['from A to B','from hotel to station to airport','something vague','from '+ 'x'.repeat(170)+' to station'])assert.equal(parseTaxiJourney(text),null);
});

test('city-only hint uses the configured city without geocoding or replacing the spoken pickup',async()=>{let searches=0;const r=await suggestAlexaPickup(device(),{cityOnly:true,fetcher:async()=>Response.json({addressLine1:'67 Synthetic Road',city:'Exeter',postalCode:'EX4 1AA',countryCode:'GB'}),address:async()=>{searches++;return [point]}});assert.equal(r.city,'Exeter');assert.equal(r.address,undefined);assert.equal(searches,0)});
