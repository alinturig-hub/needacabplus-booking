/** Build manual notification tools as self-contained Node artifacts, never invoked at startup. */
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {builtinModules} from 'node:module';
const entries=['prepare-controlled-event', 'run-controlled-booking-event'];
const directory='dist/notification-tools';
await mkdir(directory,{recursive:true});
const manifest={schema_version:1,runtime:'node >=22',automatic_execution:false,artifacts:[]};
for(const name of entries){
 const entry='scripts/notifications/'+name+'.ts',output=directory+'/'+name+'.cjs';
 const result=await build({entryPoints:[entry],outfile:output,bundle:true,platform:'node',target:'node22',format:'cjs',packages:'bundle',external:['pg-native'],metafile:true,logLevel:'warning'});
 const allowed=new Set([...builtinModules,...builtinModules.map(m=>'node:'+m),'pg-native']);
 for(const file of Object.values(result.metafile.outputs))for(const dependency of file.imports)
  if(dependency.external&&!allowed.has(dependency.path))throw Error('UNPACKAGED_TOOL_DEPENDENCY: '+dependency.path);
 const bytes=await readFile(output);
 manifest.artifacts.push({file:name+'.cjs',entry,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(directory+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared '+manifest.artifacts.length+' manual notification tools; no DB or provider calls.');
