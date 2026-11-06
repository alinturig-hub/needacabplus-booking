import test from 'node:test';import assert from 'node:assert/strict';
import {templateWorkspace,templateMediaWorkspace,templateWorkspacePublicFailure,TemplateWorkspaceError} from '../lib/notifications/template-workspace';
import {verifyService} from '../lib/whatsapp-service-auth';
import {isBookingTemplate} from '../components/shared-whatsapp/template-purpose';
const names=['NOTIFICATIONS_TEMPLATE_WORKSPACE_ENABLED','WHATSAPP_GATEWAY_ORIGIN','WHATSAPP_NAC_KEY_ID','WHATSAPP_NAC_SECRET'] as const;
test('catalog, create and binary media use fixed signed gateway paths with no browser token',async()=>{
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));Object.assign(process.env,{NOTIFICATIONS_TEMPLATE_WORKSPACE_ENABLED:'true',WHATSAPP_GATEWAY_ORIGIN:'https://crm.example',WHATSAPP_NAC_KEY_ID:'synthetic-key',WHATSAPP_NAC_SECRET:'x'.repeat(48)});
 const calls:string[]=[];
 const fake:typeof fetch=async(url,options)=>{
 const u=new URL(String(url));calls.push(u.pathname);assert.equal(u.origin,'https://crm.example');assert.equal(options?.redirect,'error');
 const body=options?.body as string|Uint8Array;
 const request=new Request(u,{method:'POST',headers:options?.headers,body:body as BodyInit});
 await verifyService(request,body,'synthetic-key','x'.repeat(48),async()=>true);
 assert.equal(request.headers.get('authorization'),null);
 return Response.json(u.pathname.endsWith('template-media')?{handle:'synthetic-handle',format:'IMAGE'}:{templates:[],submitted:false});
 };
 try{
 await templateWorkspace({action:'list'},fake);await templateWorkspace({action:'submit',draft:{name:'nac_booking_synthetic_v2'},confirmSubmission:true},fake);await templateMediaWorkspace(new Uint8Array([1,2,3]),fake);
 assert.deepEqual(calls,['/api/internal/whatsapp/v1/template-workspace','/api/internal/whatsapp/v1/template-workspace','/api/internal/whatsapp/v1/template-media']);
 let attempts=0;await assert.rejects(templateWorkspace({action:'submit'},async()=>{attempts++;throw Error('network')}),/OUTCOME_UNKNOWN/);assert.equal(attempts,1);
 process.env.NOTIFICATIONS_TEMPLATE_WORKSPACE_ENABLED='false';await assert.rejects(templateWorkspace({action:'list'},fake),/NOT_CONFIGURED/);assert.equal(calls.length,3);
 }finally{for(const k of names){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
test('booking naming convention is not the Meta category',()=>{assert.equal(isBookingTemplate('nac_booking_confirmation_v1'),true);assert.equal(isBookingTemplate('customer_information'),false)});

test('uncertain submission responses are preserved for the editor retry lock',()=>{
 assert.deepEqual(templateWorkspacePublicFailure('submit',new TemplateWorkspaceError('TEMPLATE_GATEWAY_OUTCOME_UNKNOWN')),{error:'TEMPLATE_SUBMISSION_UNCONFIRMED',status:503});
 assert.deepEqual(templateWorkspacePublicFailure('submit',new SyntaxError('truncated JSON')),{error:'TEMPLATE_SUBMISSION_UNCONFIRMED',status:503});
 assert.deepEqual(templateWorkspacePublicFailure('submit',new TemplateWorkspaceError('OPERATIONAL_TEMPLATE_REQUIRED',422)),{error:'OPERATIONAL_TEMPLATE_REQUIRED',status:422});
});
