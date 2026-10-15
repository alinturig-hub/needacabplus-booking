import {isAdmin,sameOrigin} from '@/lib/security';
import {database,failure,randomUUID} from '@/lib/local-drivers';
import {z} from 'zod';
export const dynamic='force-dynamic';
const schema=z.object({label:z.string().trim().min(1).max(100),field_type:z.enum(['text','date','file']),required:z.boolean().default(false),check_expiration:z.boolean().default(false),description:z.string().max(500).default('')});
export async function GET(){if(!await isAdmin())return Response.json({error:'Forbidden'},{status:403});try{return Response.json({items:(await database().query('SELECT id,label,field_type,required,check_expiration,description FROM driver_field_definitions ORDER BY created_at')).rows})}catch(e){return failure(e)}}
export async function POST(request:Request){if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Forbidden'},{status:403});try{const value=schema.parse(await request.json()),id=randomUUID();await database().query('INSERT INTO driver_field_definitions(id,label,field_type,required,check_expiration,description) VALUES($1,$2,$3,$4,$5,$6)',[id,value.label,value.field_type,value.required,value.field_type==='date'&&value.check_expiration,value.description]);return Response.json({id},{status:201})}catch(e){return failure(e)}}
