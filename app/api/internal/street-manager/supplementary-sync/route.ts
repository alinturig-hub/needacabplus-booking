import {timingSafeEqual} from 'node:crypto';
import {database} from '@/lib/database';
import {importPlymouthArchive,syncPlymouthCouncil} from '@/lib/street-manager/supplementary-sync';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function POST(request:Request){
 const expected=process.env.BOOKING_WRITER_JOB_SECRET,actual=request.headers.get('x-booking-writer-secret');
 if(!expected||!actual||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return Response.json({error:'UNAUTHORIZED'},{status:401});
 if(process.env.STREET_MANAGER_COUNCIL_SYNC_ENABLED!=='true')return Response.json({enabled:false});
 let client,locked=false;
 try{
  client=await database().connect();locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('nac:street-manager-supplementary-sync')) AS locked")).rows[0].locked;
  if(!locked)return Response.json({enabled:true,status:'busy'});
  const archive=await importPlymouthArchive(client),council=await syncPlymouthCouncil(client);
  return Response.json({enabled:true,archive,council},{status:council.status==='error'?503:200});
 }catch{return Response.json({error:'SUPPLEMENTARY_SYNC_UNAVAILABLE'},{status:503})}
 finally{if(client){if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('nac:street-manager-supplementary-sync'))").catch(()=>{});client.release()}}
}
