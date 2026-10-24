import {z} from 'zod';
import {database} from '@/lib/database';
import {nativeDispatchRulesSchema} from '@/lib/native-dispatch-engine';
import {isDispatchUser,sameOrigin,unavailable} from '@/lib/security';
export const dynamic='force-dynamic';
async function read(){const result=await database().query("SELECT settings->'nativeRules' rules FROM operations_settings WHERE id='dispatch'");return{rules:nativeDispatchRulesSchema.parse(result.rows[0]?.rules??{}),liveDeliveryReady:false}}
export async function GET(){if(!await isDispatchUser())return Response.json({error:'Dispatch access required.'},{status:403});try{return Response.json(await read(),{headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}}
const selection=z.object({method:z.enum(['zone_queue','nearest']),control:z.enum(['manual','automatic'])}).strict();
export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isDispatchUser())return Response.json({error:'Dispatch access required.'},{status:403});
 try{const body=selection.parse(await request.json());const change={...body,at:new Date().toISOString(),source:'operator'};
 await database().query(`INSERT INTO operations_settings(id,settings,updated_at) VALUES('dispatch',jsonb_build_object('nativeRules',$1::jsonb,'nativeMethodChanges',jsonb_build_array($2::jsonb)),now()) ON CONFLICT(id) DO UPDATE SET settings=jsonb_set(jsonb_set(operations_settings.settings,'{nativeRules}',COALESCE(operations_settings.settings->'nativeRules','{}'::jsonb)||$1::jsonb),'{nativeMethodChanges}',(CASE WHEN jsonb_array_length(COALESCE(operations_settings.settings->'nativeMethodChanges','[]'::jsonb))>=100 THEN (operations_settings.settings->'nativeMethodChanges')-0 ELSE COALESCE(operations_settings.settings->'nativeMethodChanges','[]'::jsonb) END)||jsonb_build_array($2::jsonb)),updated_at=now()`,[JSON.stringify(body),JSON.stringify(change)]);
 return Response.json(await read());
 }catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Choose a valid dispatch method.'},{status:400});return unavailable(e)}
}
