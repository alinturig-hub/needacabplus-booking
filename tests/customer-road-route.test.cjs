const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

function load(){const source=ts.transpileModule(fs.readFileSync('lib/customer-road-route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};new Function('require','module','exports',source)(require,module,module.exports);return module.exports}

test('customer map uses road-following OSRM geometry instead of a straight line',async()=>{
 const originalFetch=global.fetch,calls=[];
 global.fetch=async url=>{calls.push(String(url));return new Response(JSON.stringify({code:'Ok',routes:[{geometry:{coordinates:[[-4.1,50.1],[-4.11,50.11],[-4.2,50.2]]}}]}),{status:200})};
 try{const route=await load().customerRoadRoute([{latitude:50.1,longitude:-4.1},{latitude:50.2,longitude:-4.2}]);assert.equal(route.length,3);assert.match(calls[0],/route\/v1\/driving\/-4\.1,50\.1;-4\.2,50\.2/);assert.match(calls[0],/geometries=geojson/)}finally{global.fetch=originalFetch}
});

test('invalid or missing route geometry is rejected rather than drawn as a straight line',async()=>{
 const originalFetch=global.fetch;global.fetch=async()=>new Response(JSON.stringify({code:'NoRoute',routes:[]}));
 try{await assert.rejects(load().customerRoadRoute([{latitude:50.1,longitude:-4.1},{latitude:50.2,longitude:-4.2}]),/could not be calculated/)}finally{global.fetch=originalFetch}
});
