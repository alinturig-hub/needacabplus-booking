import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {defaultTariffPlan,newTariffRule,tariffPlanSchema,type TariffRule} from '@/lib/tariff-plan';
import {taxiCrmZones} from '@/lib/taxicrm-live';
import {taxiCrmDatabaseConfigured} from '@/lib/taxicrm-database';
import {localTariffRulesSchema} from '@/lib/local-tariffs';

export const dynamic='force-dynamic';

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const [saved,tariffs,zones]=await Promise.all([
   database().query<{plan:unknown;legacy:unknown;updated_at:string}>("SELECT settings->'tariffPlanV2' plan,settings->'localTariffRules' legacy,updated_at FROM operations_settings WHERE id='pricing'"),
   database().query<{id:string;base_pence:number;per_mile_pence:number;minimum_pence:number}>('SELECT id,base_pence,per_mile_pence,minimum_pence FROM tariffs ORDER BY id'),
   taxiCrmDatabaseConfigured()?taxiCrmZones().catch(()=>[]):Promise.resolve([]),
  ]);
  const parsed=tariffPlanSchema.safeParse(saved.rows[0]?.plan);
  const legacy=localTariffRulesSchema.safeParse(saved.rows[0]?.legacy);
  const savedPlanHasWaiting=Boolean(saved.rows[0]?.plan&&typeof saved.rows[0].plan==='object'&&'waiting' in saved.rows[0].plan);
  const saloon=tariffs.rows.find(row=>row.id==='saloon');
  const base=saloon?{startPence:saloon.base_pence,minimumPence:saloon.minimum_pence}:defaultTariffPlan.base;
  const importedRules:TariffRule[]=[];
  for(const row of tariffs.rows.filter(row=>row.id==='estate'||row.id==='xl')){
   const vehicle=row.id as 'estate'|'xl';
   const differences=[['start',row.base_pence-base.startPence,'starting fare'],['distance',row.per_mile_pence-(saloon?.per_mile_pence??defaultTariffPlan.distanceBands[0].perMilePence),'per mile'],['minimum',row.minimum_pence-base.minimumPence,'minimum fare']] as const;
   for(const [target,difference,label] of differences){if(!difference)continue;importedRules.push({...newTariffRule('vehicle'),name:`${vehicle==='xl'?'XL':'Estate'} ${label}`,vehicle,target,direction:difference>0?'add':'subtract',value:Math.abs(difference)})}
  }
  const imported={...defaultTariffPlan,base,waiting:legacy.success?legacy.data.waiting:defaultTariffPlan.waiting,distanceBands:[{...defaultTariffPlan.distanceBands[0],perMilePence:saloon?.per_mile_pence??defaultTariffPlan.distanceBands[0].perMilePence}],rules:importedRules};
  const plan=parsed.success?{...parsed.data,waiting:savedPlanHasWaiting?parsed.data.waiting:legacy.success?legacy.data.waiting:parsed.data.waiting}:imported;
  return Response.json({plan,zones:zones.map(zone=>zone.name),updatedAt:parsed.success?saved.rows[0]?.updated_at:null,imported:!parsed.success},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}

export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const parsed=tariffPlanSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message||'Invalid tariff plan.'},{status:400});
 try{
  await database().query("INSERT INTO operations_settings(id,settings,updated_at) VALUES ('pricing',jsonb_build_object('tariffPlanV2',$1::jsonb),now()) ON CONFLICT(id) DO UPDATE SET settings=jsonb_set(operations_settings.settings,'{tariffPlanV2}',$1::jsonb),updated_at=now()",[JSON.stringify(parsed.data)]);
  return Response.json({ok:true});
 }catch(error){return unavailable(error)}
}
