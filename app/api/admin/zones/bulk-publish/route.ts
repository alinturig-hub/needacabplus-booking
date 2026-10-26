import {z} from 'zod';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {mapZoneInputSchema} from '@/lib/map-zone-schema';
export const dynamic='force-dynamic';
const batchSchema=z.object({zones:z.array(z.object({id:z.string().uuid(),version:z.number().int().positive()}).strict()).min(1).max(500)}).strict().refine(b=>new Set(b.zones.map(z=>z.id)).size===b.zones.length,'Select each zone only once.');
export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let client;
 try{
  const text=await request.text();if(text.length>65536)return Response.json({error:'Select up to 500 zones at a time.'},{status:413});
  const body=batchSchema.parse(JSON.parse(text)),versions=new Map(body.zones.map(z=>[z.id,z.version]));
  client=await database().connect();await client.query('BEGIN');
  // Lock consistently, validate every saved draft, then publish the entire batch atomically.
  const current=await client.query('SELECT * FROM map_zones WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE',[body.zones.map(z=>z.id)]);
  if(current.rows.length!==body.zones.length||current.rows.some(z=>versions.get(z.id)!==z.version)){
   await client.query('ROLLBACK');return Response.json({error:'One or more zones changed or were removed. Refresh and select them again. No zones were published.'},{status:409});
  }
  const saved=current.rows.map(zone=>mapZoneInputSchema.parse(Object.fromEntries(['name','colour','purpose','enabled','geometry'].map(key=>[key,zone[key]]))));
  const zones=[];let published=0;
  for(let i=0;i<current.rows.length;i++){
   const row=current.rows[i];if(row.published_snapshot&&row.published_version===row.version){zones.push(row);continue}
   const result=await client.query('UPDATE map_zones SET published_snapshot=$1::jsonb,published_version=version+1,published_at=now(),version=version+1,updated_at=now() WHERE id=$2 RETURNING *',[JSON.stringify(saved[i]),row.id]);
   const zone=result.rows[0];await client.query('INSERT INTO map_zone_versions(zone_id,version,snapshot) VALUES($1,$2,$3::jsonb)',[zone.id,zone.version,JSON.stringify(zone)]);zones.push(zone);published++;
  }
  await client.query('COMMIT');return Response.json({zones,published});
 }catch(e){
  if(client)await client.query('ROLLBACK').catch(()=>{});
  if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Invalid selection or saved zone geometry. No zones were published.'},{status:400});
  return unavailable(e);
 }finally{client?.release()}
}
