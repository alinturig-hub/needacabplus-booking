import {database} from '@/lib/database';
import {loadStreetPreview} from '@/lib/street-manager/preview-data';
import {validStreetPreview,previewExpiresAt} from '@/lib/street-manager/preview-access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer'};
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
 if(!validStreetPreview((await params).token))return Response.json({error:'Preview link is invalid or expired.'},{status:404,headers});
 let client;
 try{
  client=await database().connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='8s'");
  const data=await loadStreetPreview(client);await client.query('COMMIT');
  return Response.json({...data,expiresAt:previewExpiresAt},{headers});
 }catch{await client?.query('ROLLBACK').catch(()=>{});return Response.json({error:'Roadworks data is temporarily unavailable.'},{status:503,headers})}
 finally{client?.release()}
}
