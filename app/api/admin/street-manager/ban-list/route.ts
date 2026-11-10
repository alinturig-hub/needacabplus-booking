import {z} from 'zod';
import {isAdmin,sameOrigin} from '@/lib/security';
import {database} from '@/lib/database';
import {BanListError,listTrafficBans,mutateTrafficBans} from '@/lib/street-manager/message-bans';
export const dynamic='force-dynamic';export const runtime='nodejs';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('add'),callsigns:z.string().min(1).max(2500)}).strict(),
 z.object({action:z.literal('edit'),id:z.string().uuid(),version:z.number().int().positive(),callsign:z.string().min(1).max(100)}).strict(),
 z.object({action:z.literal('remove'),id:z.string().uuid(),version:z.number().int().positive()}).strict(),
]);
const headers={'Cache-Control':'private, no-store'};
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403,headers});
 try{return Response.json({entries:await listTrafficBans(database())},{headers})}catch{return Response.json({error:'Ban list is temporarily unavailable.'},{status:503,headers})}
}
export async function POST(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403,headers});
 let input;try{input=schema.parse(await request.json())}catch{return Response.json({error:'Enter valid ban list details.'},{status:400,headers})}
 let client;
 try{client=await database().connect();await client.query("SET statement_timeout='12s'");return Response.json({entries:await mutateTrafficBans(client,input)},{headers})}
 catch(error){if(error instanceof BanListError)return Response.json({error:error.message,code:error.code},{status:error.status,headers});return Response.json({error:'Unable to confirm the save. Refresh the ban list before trying again.'},{status:503,headers})}
 finally{if(client){await client.query('RESET statement_timeout').catch(()=>{});client.release()}}
}
