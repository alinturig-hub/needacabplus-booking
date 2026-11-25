import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const endpoint={uri:'https://webapp.needacabplus.app/api/alexa/guest',sslCertificateType:'Trusted'};
export function prepareNotifications(source){
 const root=structuredClone(source),manifest=root.manifest;
 if(manifest?.apis?.custom?.endpoint?.uri!==endpoint.uri)throw Error('Expected the existing guest HTTPS skill manifest.');
 const unique=(values,key)=>values.filter((item,index)=>values.findIndex(other=>other[key]===item[key])===index);
 manifest.permissions=unique([...(manifest.permissions||[]),{name:'alexa::devices:all:notifications:write'}],'name');
 const events=manifest.events||{};events.endpoint=endpoint;
 events.publications=unique([...(events.publications||[]),{eventName:'AMAZON.MessageAlert.Activated'}],'eventName');
 events.subscriptions=unique([...(events.subscriptions||[]),...['SKILL_PROACTIVE_SUBSCRIPTION_CHANGED','SKILL_PERMISSION_ACCEPTED','SKILL_PERMISSION_CHANGED','SKILL_DISABLED'].map(eventName=>({eventName}))],'eventName');
 for(const region of Object.values(events.regions||{}))region.endpoint=endpoint;
 manifest.events=events;return root;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node alexa/tools/prepare-notifications.mjs current-manifest.json notifications-manifest.json');
 const result=prepareNotifications(JSON.parse(await readFile(input,'utf8')));await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log('Prepared manifest; no Amazon settings were changed.');
}
