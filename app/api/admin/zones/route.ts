import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {mapZoneInputSchema} from '@/lib/map-zone-schema';
export const dynamic='force-dynamic';
export async function GET(request?:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const result=await database().query('SELECT id,name,colour,purpose,enabled,geometry,version,updated_at,published_snapshot,published_version,published_at,source_provider,source_external_id,source_payload FROM map_zones ORDER BY lower(name),id');const live=request&&new URL(request.url).searchParams.get('view')==='live';const zones=live?result.rows.filter(row=>row.published_snapshot?.enabled).map(row=>({...row.published_snapshot,id:row.id,version:row.published_version,updated_at:row.published_at})):result.rows;return Response.json({zones},{headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}
}
const updateSchema=mapZoneInputSchema.extend({id:z.string().uuid(),version:z.number().int().positive()});
async function save(request:Request,update:boolean){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let client;try{
 const text=await request.text();if(text.length>200000)return Response.json({error:'Zone geometry is too large.'},{status:413});
 const body=update?updateSchema.parse(JSON.parse(text)):mapZoneInputSchema.parse(JSON.parse(text));
 client=await database().connect();await client.query('BEGIN');
 const input=[body.name,body.colour,body.purpose,body.enabled,JSON.stringify(body.geometry)];
 const result=update&&'id' in body&&'version' in body?await client.query('UPDATE map_zones SET name=$1,colour=$2,purpose=$3,enabled=$4,geometry=$5::jsonb,version=version+1,updated_at=now() WHERE id=$6 AND version=$7 RETURNING *',[...input,body.id,body.version]):await client.query('INSERT INTO map_zones(name,colour,purpose,enabled,geometry,id) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *',[...input,randomUUID()]);
 if(!result.rows.length){await client.query('ROLLBACK');return Response.json({error:'This zone changed in another session. Reload it before saving.'},{status:409})}
 const zone=result.rows[0];await client.query('INSERT INTO map_zone_versions(zone_id,version,snapshot) VALUES($1,$2,$3::jsonb)',[zone.id,zone.version,JSON.stringify(zone)]);await client.query('COMMIT');return Response.json({zone},{status:update?200:201});
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:e instanceof z.ZodError?e.issues[0]?.message:'Invalid JSON.'},{status:400});if((e as {code?:string}).code==='23505')return Response.json({error:'A zone with this name already exists.'},{status:409});return unavailable(e)}finally{client?.release()}
}
export async function POST(request:Request){return save(request,false)}
export async function PUT(request:Request){return save(request,true)}

const publicationSchema=z.object({id:z.string().uuid(),version:z.number().int().positive(),action:z.enum(['publish','unpublish'])}).strict();
export async function PATCH(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let client;try{
 const body=publicationSchema.parse(await request.json());client=await database().connect();await client.query('BEGIN');
 const current=await client.query('SELECT * FROM map_zones WHERE id=$1 AND version=$2 FOR UPDATE',[body.id,body.version]);
 if(!current.rows.length){await client.query('ROLLBACK');return Response.json({error:'This zone changed in another session. Reload it before publishing.'},{status:409})}
 const saved=mapZoneInputSchema.parse(Object.fromEntries(['name','colour','purpose','enabled','geometry'].map(key=>[key,current.rows[0][key]])));
 const result=body.action==='publish'
  ?await client.query('UPDATE map_zones SET published_snapshot=$1::jsonb,published_version=version+1,published_at=now(),version=version+1,updated_at=now() WHERE id=$2 RETURNING *',[JSON.stringify(saved),body.id])
  :await client.query('UPDATE map_zones SET published_snapshot=NULL,published_version=NULL,published_at=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[body.id]);
 const zone=result.rows[0];await client.query('INSERT INTO map_zone_versions(zone_id,version,snapshot) VALUES($1,$2,$3::jsonb)',[zone.id,zone.version,JSON.stringify(zone)]);await client.query('COMMIT');return Response.json({zone});
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Invalid publication request or zone geometry.'},{status:400});return unavailable(e)}finally{client?.release()}
}
