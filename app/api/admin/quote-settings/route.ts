import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {quotePolicySchema} from '@/lib/quote-policy';
import {loadQuotePolicy,demandSnapshot} from '@/lib/quotes';
export const dynamic='force-dynamic';
export async function GET(){if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{const policy=await loadQuotePolicy();return Response.json({policy,demand:await demandSnapshot(policy)},{headers:{'Cache-Control':'no-store'}})}catch(error){return unavailable(error)}}
export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const result=quotePolicySchema.safeParse(await request.json().catch(()=>null));if(!result.success)return Response.json({error:result.error.issues[0].message},{status:400});
 try{await database().query(`INSERT INTO operations_settings(id,settings,updated_at) VALUES ('pricing',jsonb_build_object('liveQuotes',$1::jsonb),now()) ON CONFLICT(id) DO UPDATE SET settings=jsonb_set(operations_settings.settings,'{liveQuotes}',$1::jsonb),updated_at=now()`,[JSON.stringify(result.data)]);return Response.json({ok:true})}catch(error){return unavailable(error)}
}
