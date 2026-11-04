import {fullStageGuard} from '@/lib/notifications/full/guard';
import {isAdmin,sameOrigin} from '@/lib/security';
import {database} from '@/lib/database';
import {boundedBody} from '@/lib/whatsapp-service-auth';
import {ruleSchema} from '@/lib/notifications/model';
import {rules,saveRule,history,recordDecision} from '@/lib/notifications/store';
import {fixture,scenarios,type Scenario} from '@/lib/notifications/fixtures';
import {decide} from '@/lib/notifications/engine';
export const dynamic='force-dynamic';
function enabled(){if(process.env.NOTIFICATIONS_FULL_STAGE==='true'){fullStageGuard();return true}return process.env.NOTIFICATIONS_DEVELOPMENT_ENABLED==='true'&&process.env.NODE_ENV!=='production'}
export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Admin access required.'},{status:403});
 if(!enabled())return Response.json({enabled:false,mode:'DRY_RUN',rules:[],history:{items:[],nextCursor:null},notice:'Development workspace is not enabled. No sending is available.'});
 try{const p=new URL(request.url).searchParams;return Response.json({enabled:true,fullStage:process.env.NOTIFICATIONS_FULL_STAGE==='true',mode:'DRY_RUN',rules:await rules(database()),history:await history(database(),{booking:p.get('booking')||undefined,event:p.get('event')||undefined,channel:p.get('channel')||undefined,rule:p.get('rule')||undefined,result:p.get('result')||undefined,before:p.get('before')||undefined})},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Development notification storage is unavailable. Apply the development migration first.'},{status:503})}
}
export async function POST(request:Request){
 if(!await isAdmin()||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403});
 if(!enabled())return Response.json({error:'Development-only module. No sending is available.'},{status:409});
 try{const body=JSON.parse(await boundedBody(request));
 if(['save','activate','disable'].includes(body.action)){
 const rule=ruleSchema.parse(body.rule);if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)throw Error('INVALID_VERSION');
 return Response.json({rule:await saveRule(database(),rule,body.action,body.expectedVersion),mode:'DRY_RUN'});
 }
 if(body.action==='preview'){
 const rule=ruleSchema.parse(body.rule);if(!scenarios.includes(body.scenario))throw Error('INVALID_SCENARIO');
 const context=fixture(rule,body.scenario as Scenario);const decision=decide(rule,context);
 if(typeof body.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.requestId))throw Error('INVALID_REQUEST_ID');
 return Response.json(await recordDecision(database(),body.requestId,decision));
 }
 if(body.action==='revisions'&&typeof body.id==='string')return Response.json({revisions:(await database().query('SELECT version,action,changed_at FROM notification_rule_revisions WHERE rule_id=$1 ORDER BY version DESC LIMIT 100',[body.id])).rows});
 return Response.json({error:'Unsupported action. Sending is not implemented by this API.'},{status:422});
 }catch(error){const conflict=error instanceof Error&&/CONFLICT/.test(error.message);return Response.json({error:conflict?'Revision conflict. Reload before saving.':'Invalid notification request.'},{status:conflict?409:422})}
}
