import {requireAutocabIntegration} from '@/lib/integration-control';
import {pricingFeatureFields} from '@/lib/pricing-feature-scopes';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {quotePolicySchema} from '@/lib/quote-policy';
import {mergeQuotePolicyScope} from '@/lib/quote-policy-scopes';
import {loadQuotePolicy,demandSnapshot,smartFareSnapshot} from '@/lib/quotes';
import {smartFareDecision} from '@/lib/smart-fare';
import type {PoolClient} from 'pg';
export const dynamic='force-dynamic';
export async function GET(request?:Request){if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{const native=request&&new URL(request.url).searchParams.get('model')==='native';if(!native)await requireAutocabIntegration();const policy=await loadQuotePolicy(native?'native':'autocab');if(native)return Response.json({policy,demand:{mode:'native-not-connected',waiting:null,clear:null},smartFare:{waiting:null,clear:null,fresh:false,quiet:false,reason:'native-signal-not-connected'}},{headers:{'Cache-Control':'no-store'}});const [demand,signal]=await Promise.all([demandSnapshot(policy),smartFareSnapshot(policy)]);return Response.json({policy,demand,smartFare:{...signal,...smartFareDecision(policy,signal)}},{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}}
export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const result=quotePolicySchema.safeParse(await request.json().catch(()=>null));if(!result.success)return Response.json({error:result.error.issues[0].message},{status:400});
 try{await requireAutocabIntegration();await database().query(`INSERT INTO operations_settings(id,settings,updated_at) VALUES ('pricing',jsonb_build_object('liveQuotes',$1::jsonb),now()) ON CONFLICT(id) DO UPDATE SET settings=jsonb_set(operations_settings.settings,'{liveQuotes}',$1::jsonb),updated_at=now()`,[JSON.stringify(result.data)]);return Response.json({ok:true})}catch(error){return unavailable(error)}
}

// These two screens edit the same policy. Merge only the fields owned by the
// screen that saved, under a row lock, so one screen cannot overwrite changes
// made in the other screen while it was open.
export async function PATCH(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const raw:unknown=await request.json().catch(()=>null);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return Response.json({error:'Invalid settings scope.'},{status:400});
 const body=raw as {scope?:unknown;policy?:unknown;model?:unknown;feature?:unknown};
 const native=body.model==='native';if(body.model!==undefined&&body.model!=='native'&&body.model!=='autocab')return Response.json({error:'Invalid pricing model.'},{status:400});
 if(body.feature!==undefined&&(typeof body.feature!=='string'||!Object.hasOwn(pricingFeatureFields,body.feature)))return Response.json({error:'Invalid pricing section.'},{status:400});
 if(native&&(body.scope==='autocab'||body.feature==='advanced'))return Response.json({error:'Autocab source fields do not apply to N+.'},{status:400});
 if(body.scope!=='autocab'&&body.scope!=='shared')return Response.json({error:'Invalid settings scope.'},{status:400});
 const incoming=quotePolicySchema.safeParse(body.policy);
 if(!incoming.success)return Response.json({error:incoming.error.issues[0]?.message||'Invalid pricing settings.'},{status:400});
 let client:PoolClient;
 try{client=await database().connect()}catch(error){return unavailable(error)}
 try{
  if(!native)await requireAutocabIntegration();
  await client.query('BEGIN');
  await client.query("INSERT INTO operations_settings(id,settings) VALUES ('pricing','{}'::jsonb) ON CONFLICT(id) DO NOTHING");
  const row=await client.query<{policy:unknown}>(native?"SELECT settings->'nativeQuotes' policy FROM operations_settings WHERE id='pricing' FOR UPDATE":"SELECT settings->'liveQuotes' policy FROM operations_settings WHERE id='pricing' FOR UPDATE");
  const current=quotePolicySchema.parse(row.rows[0]?.policy||{});
  let merged=mergeQuotePolicyScope(current,incoming.data,body.scope);
  if(typeof body.feature==='string'){const keys=pricingFeatureFields[body.feature];merged=quotePolicySchema.parse({...current,...Object.fromEntries(keys.map(key=>[key,incoming.data[key]]))})}
  if(native)merged=quotePolicySchema.parse({...merged,enabled:false,smartFareCapabilities:[],serviceCapabilities:{asap:[],priority:[],prebook:[],guarantee:[]}});
  await client.query(native?"UPDATE operations_settings SET settings=jsonb_set(settings,'{nativeQuotes}',$1::jsonb),updated_at=now() WHERE id='pricing'":"UPDATE operations_settings SET settings=jsonb_set(settings,'{liveQuotes}',$1::jsonb),updated_at=now() WHERE id='pricing'",[JSON.stringify(merged)]);
  await client.query('COMMIT');
  return Response.json({ok:true});
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);return unavailable(error)}finally{client.release()}
}
