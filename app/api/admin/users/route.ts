import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/lib/database';
import {hashPassword} from '@/lib/customer-auth';
import {ADMIN_EMAIL,isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {currentStaff} from '@/lib/staff-auth';

export const dynamic='force-dynamic';
const role=z.enum(['admin','dispatcher']);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value).nullable();
const details=z.object({email:z.string().trim().email().max(254),firstName:z.string().trim().min(1).max(70),surname:z.string().trim().min(1).max(70),mobile:z.string().trim().max(40),landline:z.string().trim().max(40),companyId:z.string().uuid().nullable(),startDate:date,endDate:date,role,enabled:z.boolean()});
const validPeriod=<T extends {startDate:string|null;endDate:string|null}>(value:T)=>!value.startDate||!value.endDate||value.endDate>=value.startDate;
const createSchema=details.extend({password:z.string().min(12).max(200)}).strict().refine(validPeriod,{message:'End date must be on or after start date.'});
const updateSchema=details.extend({id:z.string().uuid(),password:z.string().min(12).max(200).optional()}).strict().refine(validPeriod,{message:'End date must be on or after start date.'});
const denied=()=>Response.json({error:'Administrator access required.'},{status:403});
const fields='id,email,full_name,first_name,surname,mobile,landline,company_id,start_date,end_date,role,enabled,created_at,updated_at';
async function companyValid(id:string|null){if(!id)return true;return Boolean((await database().query('SELECT 1 FROM operating_companies WHERE id=$1 AND active=true',[id])).rowCount)}

export async function GET(){
 if(!await isAdmin())return denied();
 try{
  const result=await database().query(`SELECT ${fields} FROM staff_accounts ORDER BY created_at DESC`);
  return Response.json({primary:{email:ADMIN_EMAIL},users:result.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}

export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return denied();
 const parsed=createSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message||'Enter valid user details and a password of at least 12 characters.'},{status:400});
 const input=parsed.data,email=input.email.toLowerCase();
 if(email===ADMIN_EMAIL.toLowerCase())return Response.json({error:'The primary administrator email is reserved.'},{status:409});
 try{
  if(!await companyValid(input.companyId))return Response.json({error:'Select an active company.'},{status:400});
  const result=await database().query(`INSERT INTO staff_accounts(id,email,full_name,first_name,surname,mobile,landline,company_id,start_date,end_date,password_hash,role,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${fields}`,[randomUUID(),email,`${input.firstName} ${input.surname}`,input.firstName,input.surname,input.mobile,input.landline,input.companyId,input.startDate,input.endDate,await hashPassword(input.password),input.role,input.enabled]);
  return Response.json({user:result.rows[0]},{status:201});
 }catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='23505')return Response.json({error:'This email already has an account.'},{status:409});return unavailable(error)}
}

export async function PATCH(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return denied();
 const parsed=updateSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message||'Invalid user changes. Passwords must have at least 12 characters.'},{status:400});
 const input=parsed.data,me=await currentStaff();
 if(input.email.toLowerCase()===ADMIN_EMAIL.toLowerCase())return Response.json({error:'The primary administrator email is reserved.'},{status:409});
 if(me?.id===input.id&&(!input.enabled||input.role!=='admin'))return Response.json({error:'You cannot remove your own administrator access.'},{status:400});
 try{
  const db=database();
  if(!await companyValid(input.companyId))return Response.json({error:'Select an active company.'},{status:400});
  const result=await db.query(`UPDATE staff_accounts SET email=$2,full_name=$3,first_name=$4,surname=$5,mobile=$6,landline=$7,company_id=$8,start_date=$9,end_date=$10,role=$11,enabled=$12,password_hash=COALESCE($13,password_hash),updated_at=now() WHERE id=$1 RETURNING ${fields}`,[input.id,email(input.email),`${input.firstName} ${input.surname}`,input.firstName,input.surname,input.mobile,input.landline,input.companyId,input.startDate,input.endDate,input.role,input.enabled,input.password?await hashPassword(input.password):null]);
  if(!result.rowCount)return Response.json({error:'User not found.'},{status:404});
  await db.query('DELETE FROM staff_sessions WHERE staff_id=$1',[input.id]);
  return Response.json({user:result.rows[0]});
 }catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='23505')return Response.json({error:'This email already has an account.'},{status:409});return unavailable(error)}
}
function email(value:string){return value.toLowerCase()}
