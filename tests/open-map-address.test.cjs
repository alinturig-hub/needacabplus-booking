const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(){const source=ts.transpileModule(fs.readFileSync('lib/open-map-address.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};new Function('require','module','exports',source)(require,module,module.exports);return module.exports}
test('OpenStreetMap reverse lookup returns and caches a readable address',async()=>{const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({display_name:'The Navy Inn, Plymouth, PL1'}))};try{const api=load();assert.equal(await api.reverseOpenMapAddress(50.37123,-4.14234),'The Navy Inn, Plymouth, PL1');assert.equal(await api.reverseOpenMapAddress(50.37123,-4.14234),'The Navy Inn, Plymouth, PL1');assert.equal(calls,1)}finally{global.fetch=original}});
