import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {quotePolicySchema} from '@/lib/quote-policy';
import {mergeQuotePolicyScope} from '@/lib/quote-policy-scopes';
import {loadQuotePolicy,demandSnapshot,smartFareSnapshot} from '@/lib/quotes';
import {smartFareDecision} from '@/lib/smart-fare';
import type {PoolClient} from 'pg';
export const dynamic='force-dynamic';
export async function GET(){if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{const policy=await loadQuotePolicy();const [demand,signal]=await Promise.all([demandSnapshot(policy),smartFareSnapshot(policy)]);return Response.json({policy,demand,smartFare:{...signal,...smartFareDecision(policy,signal)}},{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}}
export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const result=quotePolicySchema.safeParse(await request.json().catch(()=>null));if(!result.success)return Response.json({error:result.error.issues[0].message},{status:400});
 try{await database().query(`INSERT INTO operations_settings(id,settings,updated_at) VALUES ('pricing',jsonb_build_object('liveQuotes',$1::jsonb),now()) ON CONFLICT(id) DO UPDATE SET settings=jsonb_set(operations_settings.settings,'{liveQuotes}',$1::jsonb),updated_at=now()`,[JSON.stringify(result.data)]);return Response.json({ok:true})}catch(error){return unavailable(error)}
}

// These two screens edit the same policy. Merge only the fields owned by the
// screen that saved, under a row lock, so one screen cannot overwrite changes
// made in the other screen while it was open.
export async function PATCH(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const raw:unknown=await request.json().catch(()=>null);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return Response.json({error:'Invalid settings scope.'},{status:400});
 const body=raw as {scope?:unknown;policy?:unknown};
 if(body.scope!=='autocab'&&body.scope!=='shared')return Response.json({error:'Invalid settings scope.'},{status:400});
 const incoming=quotePolicySchema.safeParse(body.policy);
 if(!incoming.success)return Response.json({error:incoming.error.issues[0]?.message||'Invalid pricing settings.'},{status:400});
 let client:PoolClient;
 try{client=await database().connect()}catch(error){return unavailable(error)}
 try{
  await client.query('BEGIN');
  await client.query("INSERT INTO operations_settings(id,settings) VALUES ('pricing','{}'::jsonb) ON CONFLICT(id) DO NOTHING");
  const row=await client.query<{policy:unknown}>("SELECT settings->'liveQuotes' policy FROM operations_settings WHERE id='pricing' FOR UPDATE");
  const current=quotePolicySchema.parse(row.rows[0]?.policy||{});
  const merged=mergeQuotePolicyScope(current,incoming.data,body.scope);
  await client.query("UPDATE operations_settings SET settings=jsonb_set(settings,'{liveQuotes}',$1::jsonb),updated_at=now() WHERE id='pricing'",[JSON.stringify(merged)]);
  await client.query('COMMIT');
  return Response.json({ok:true});
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);return unavailable(error)}finally{client.release()}
}
