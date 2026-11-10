import {z} from 'zod';
import {boundedText} from '@/lib/street-manager/sns';
import {timingSafeEqual} from 'node:crypto';
import {database} from '@/lib/database';
import {importPlymouthArchive,syncPlymouthCouncil} from '@/lib/street-manager/supplementary-sync';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function POST(request:Request){
 const expected=process.env.BOOKING_WRITER_JOB_SECRET,actual=request.headers.get('x-booking-writer-secret');
 if(!expected||!actual||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return Response.json({error:'UNAUTHORIZED'},{status:401});
 if(process.env.STREET_MANAGER_COUNCIL_SYNC_ENABLED!=='true')return Response.json({enabled:false});
 let snapshot:{html:string;fetchedAt:string}|undefined;
 try{const body=await boundedText(new Response(request.body),1600000);if(body.trim())snapshot=z.object({councilSnapshot:z.object({html:z.string().min(1).max(1500000),fetchedAt:z.string().datetime({offset:true})}).strict()}).strict().parse(JSON.parse(body)).councilSnapshot;if(snapshot&&(Date.now()-Date.parse(snapshot.fetchedAt)>300000||Date.parse(snapshot.fetchedAt)>Date.now()+5000))return Response.json({error:'Council snapshot must have been fetched within 5 minutes.'},{status:400});}catch{return Response.json({error:'Invalid Council snapshot.'},{status:400});}
 let client,locked=false;
 try{
  client=await database().connect();locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('nac:street-manager-supplementary-sync')) AS locked")).rows[0].locked;
  if(!locked)return Response.json({enabled:true,status:'busy'});
  const archive=await importPlymouthArchive(client),council=await syncPlymouthCouncil(client,snapshot);
  return Response.json({enabled:true,archive,council},{status:council.status==='error'?503:200});
 }catch{return Response.json({error:'SUPPLEMENTARY_SYNC_UNAVAILABLE'},{status:503})}
 finally{if(client){if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('nac:street-manager-supplementary-sync'))").catch(()=>{});client.release()}}
}
