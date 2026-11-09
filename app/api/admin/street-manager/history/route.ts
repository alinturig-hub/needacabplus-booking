import {isAdmin} from '@/lib/security';
import {database} from '@/lib/database';
import {historyStatusSchema,parseAlertHistoryCursor,loadDriverAlertHistory} from '@/lib/street-manager/alert-history';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Forbidden'},{status:403});
 const parameters=new URL(request.url).searchParams,cursor=parameters.get('cursor'),status=parameters.get('status')??'all';
 try{historyStatusSchema.parse(status);parseAlertHistoryCursor(cursor)}catch{return Response.json({error:'Invalid history filter or cursor.'},{status:400})}
 let client;
 try{
  client=await database().connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='5s'");
  const history=await loadDriverAlertHistory(client,{cursor,status});await client.query('COMMIT');return Response.json(history,{headers:{'Cache-Control':'private, no-store'}});
 }catch{await client?.query('ROLLBACK').catch(()=>{});return Response.json({error:'Alert history is temporarily unavailable.'},{status:503})}finally{client?.release()}
}
