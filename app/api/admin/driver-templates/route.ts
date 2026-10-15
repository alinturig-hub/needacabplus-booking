import {isAdmin,sameOrigin} from '@/lib/security';
import {database,failure,randomUUID} from '@/lib/local-drivers';
import {z} from 'zod';
export const dynamic='force-dynamic';
const schema=z.object({name:z.string().trim().min(1).max(100),description:z.string().max(500).default(''),field_ids:z.array(z.string().uuid()).max(50).default([])});
export async function GET(){if(!await isAdmin())return Response.json({error:'Forbidden'},{status:403});try{return Response.json({items:(await database().query('SELECT id,name,description,field_ids FROM driver_templates ORDER BY name')).rows})}catch(e){return failure(e)}}
export async function POST(request:Request){if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Forbidden'},{status:403});try{const value=schema.parse(await request.json()),id=randomUUID();await database().query('INSERT INTO driver_templates(id,name,description,field_ids) VALUES($1,$2,$3,$4)',[id,value.name,value.description,value.field_ids]);return Response.json({id},{status:201})}catch(e){return failure(e)}}
