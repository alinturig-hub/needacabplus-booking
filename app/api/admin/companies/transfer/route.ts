import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/lib/database';
import {companyFields} from '@/lib/operating-companies';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';
const importSchema=z.object({version:z.literal(1),companies:z.array(companyFields).min(1).max(500)}).strict().refine(value=>new Set(value.companies.map(item=>item.code)).size===value.companies.length,{message:'Company codes must be unique in the file.'});

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const result=await database().query('SELECT code,name,email,phone,active FROM operating_companies ORDER BY code');return new Response(JSON.stringify({version:1,companies:result.rows},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="needacabplus-companies.json"','Cache-Control':'no-store'}})}catch(error){return unavailable(error)}
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const text=await request.text();if(text.length>500_000)return Response.json({error:'Import file is too large.'},{status:413});
 let parsed;try{parsed=importSchema.safeParse(JSON.parse(text))}catch{return Response.json({error:'The file must be valid JSON.'},{status:400})}
 if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message||'Invalid companies file.'},{status:400});
 let client;try{client=await database().connect()}catch(error){return unavailable(error)}
 try{
  await client.query('BEGIN');let added=0,updated=0;
  for(const company of parsed.data.companies){const result=await client.query<{inserted:boolean}>(`INSERT INTO operating_companies(id,code,name,email,phone,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,active=EXCLUDED.active,updated_at=now() RETURNING (xmax=0) AS inserted`,[randomUUID(),company.code,company.name,company.email,company.phone,company.active]);if(result.rows[0]?.inserted)added++;else updated++}
  await client.query('COMMIT');return Response.json({added,updated});
 }catch(error){await client.query('ROLLBACK');return unavailable(error)}finally{client.release()}
}
