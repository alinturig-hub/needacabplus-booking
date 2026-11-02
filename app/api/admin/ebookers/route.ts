import {randomUUID} from 'node:crypto';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {ebookerInputSchema} from '@/lib/ebooker-policy';
import {ebookerFromRow,type EbookerRow} from '@/lib/ebookers';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const result=await database().query<EbookerRow&{requests:number}>('SELECT e.*, (SELECT count(*)::int FROM ebooker_booking_origins o WHERE o.ebooker_id=e.id) AS requests FROM ebookers e ORDER BY e.created_at DESC');return Response.json({items:result.rows.map(row=>({...ebookerFromRow(row),requests:row.requests}))},{headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}
}
export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const raw=await request.text();if(raw.length>64_000)return Response.json({error:'Configuration is too large.'},{status:413});
  const input=ebookerInputSchema.safeParse(JSON.parse(raw));if(!input.success)return Response.json({error:input.error.issues[0]?.message||'Check the eBooker settings.'},{status:400});
  const result=await database().query<EbookerRow>('INSERT INTO ebookers(id,slug,settings,enabled) VALUES($1,$2,$3::jsonb,$4) RETURNING *',[randomUUID(),input.data.slug,JSON.stringify(input.data),input.data.enabled]);
  return Response.json({item:ebookerFromRow(result.rows[0])},{status:201});
 }catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='23505')return Response.json({error:'This public link is already in use.'},{status:409});if(e instanceof SyntaxError)return Response.json({error:'Invalid JSON.'},{status:400});return unavailable(e)}
}
