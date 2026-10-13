import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/lib/database';
import {hashPassword} from '@/lib/customer-auth';
import {ADMIN_EMAIL,isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {currentStaff} from '@/lib/staff-auth';

export const dynamic='force-dynamic';
const role=z.enum(['admin','dispatcher']);
const createSchema=z.object({email:z.string().trim().email().max(254),fullName:z.string().trim().min(2).max(100),password:z.string().min(12).max(200),role}).strict();
const updateSchema=z.object({id:z.string().uuid(),role,enabled:z.boolean(),password:z.string().min(12).max(200).optional()}).strict();
const denied=()=>Response.json({error:'Administrator access required.'},{status:403});

export async function GET(){
 if(!await isAdmin())return denied();
 try{
  const result=await database().query('SELECT id,email,full_name,role,enabled,created_at,updated_at FROM staff_accounts ORDER BY created_at DESC');
  return Response.json({primary:{email:ADMIN_EMAIL},users:result.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return denied();
 const parsed=createSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Enter a valid name, email, role and password of at least 12 characters.'},{status:400});
 const input=parsed.data,email=input.email.toLowerCase();
 if(email===ADMIN_EMAIL.toLowerCase())return Response.json({error:'The primary administrator email is reserved.'},{status:409});
 try{
  const result=await database().query('INSERT INTO staff_accounts(id,email,full_name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,email,full_name,role,enabled,created_at,updated_at',[randomUUID(),email,input.fullName,await hashPassword(input.password),input.role]);
  return Response.json({user:result.rows[0]},{status:201});
 }catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='23505')return Response.json({error:'This email already has an account.'},{status:409});return unavailable(error)}
}

export async function PATCH(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return denied();
 const parsed=updateSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Invalid user changes. Passwords must have at least 12 characters.'},{status:400});
 const input=parsed.data,me=await currentStaff();
 if(me?.id===input.id&&(!input.enabled||input.role!=='admin'))return Response.json({error:'You cannot remove your own administrator access.'},{status:400});
 try{
  const db=database();
  const result=await db.query('UPDATE staff_accounts SET role=$2,enabled=$3,password_hash=COALESCE($4,password_hash),updated_at=now() WHERE id=$1 RETURNING id,email,full_name,role,enabled,created_at,updated_at',[input.id,input.role,input.enabled,input.password?await hashPassword(input.password):null]);
  if(!result.rowCount)return Response.json({error:'User not found.'},{status:404});
  await db.query('DELETE FROM staff_sessions WHERE staff_id=$1',[input.id]);
  return Response.json({user:result.rows[0]});
 }catch(error){return unavailable(error)}
}
