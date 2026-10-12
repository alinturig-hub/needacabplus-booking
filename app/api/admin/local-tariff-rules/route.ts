import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {defaultLocalTariffRules,localTariffRulesSchema} from '@/lib/local-tariffs';
import {taxiCrmZones} from '@/lib/taxicrm-live';
import {taxiCrmDatabaseConfigured} from '@/lib/taxicrm-database';
import {z} from 'zod';
import type {PoolClient} from 'pg';

export const dynamic='force-dynamic';

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const [saved,zones]=await Promise.all([
   database().query<{rules:unknown;updated_at:string}>('SELECT settings->\'localTariffRules\' rules,updated_at FROM operations_settings WHERE id=$1',['pricing']),
   taxiCrmDatabaseConfigured()?taxiCrmZones().catch(()=>[]):Promise.resolve([]),
  ]);
  const parsed=localTariffRulesSchema.safeParse(saved.rows[0]?.rules);
  return Response.json({rules:parsed.success?parsed.data:defaultLocalTariffRules,zones:zones.map(zone=>zone.name),updatedAt:saved.rows[0]?.rules?saved.rows[0]?.updated_at:null},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}

export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const tariffSchema=z.object({id:z.enum(['saloon','estate','xl']),basePence:z.number().int().min(0).max(100000),perMilePence:z.number().int().min(1).max(100000),minimumPence:z.number().int().min(1).max(100000)}).strict();
 const parsed=z.object({tariffs:z.array(tariffSchema).length(3).refine(rows=>new Set(rows.map(row=>row.id)).size===3,{message:'Provide all three vehicle categories.'}),rules:localTariffRulesSchema}).strict().safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message||'Invalid local tariff rules.'},{status:400});
 let client:PoolClient;
 try{client=await database().connect()}catch(error){return unavailable(error)}
 try{
  await client.query('BEGIN');
  for(const row of parsed.data.tariffs)await client.query(`INSERT INTO tariffs(id,base_pence,per_mile_pence,minimum_pence,updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT(id) DO UPDATE SET base_pence=EXCLUDED.base_pence,per_mile_pence=EXCLUDED.per_mile_pence,minimum_pence=EXCLUDED.minimum_pence,updated_at=now()`,[row.id,row.basePence,row.perMilePence,row.minimumPence]);
  await client.query(`INSERT INTO operations_settings(id,settings,updated_at) VALUES ('pricing',jsonb_build_object('localTariffRules',$1::jsonb),now()) ON CONFLICT(id) DO UPDATE SET settings=jsonb_set(operations_settings.settings,'{localTariffRules}',$1::jsonb),updated_at=now()`,[JSON.stringify(parsed.data.rules)]);
  await client.query('COMMIT');
  return Response.json({ok:true});
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);return unavailable(error)}finally{client.release()}
}
