import {isAdmin} from '@/lib/security';
import {database} from '@/lib/database';
import {streetManagerStatus} from '@/lib/street-manager/status';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){
 const headers={'Cache-Control':'private, no-store'};
 if(!await isAdmin())return Response.json({error:'Admin access required.'},{status:403,headers});
 let client;
 try{client=await database().connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='5s'");const status=await streetManagerStatus(client);await client.query('COMMIT');return Response.json(status,{headers})}
 catch{await client?.query('ROLLBACK').catch(()=>{});return Response.json({error:'Street Manager status unavailable.'},{status:503,headers})}
 finally{client?.release()}
}
