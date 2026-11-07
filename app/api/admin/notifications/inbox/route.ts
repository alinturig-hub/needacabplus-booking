import {isAdmin,sameOrigin} from '@/lib/security';
import {boundedBody} from '@/lib/whatsapp-service-auth';
import {inboxGateway,InboxGatewayError} from '@/lib/notifications/inbox-gateway';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(!await isAdmin())return Response.json({error:'Admin access required.'},{status:403,headers});
 try{
  const params=new URL(request.url).searchParams;
  if([...params.keys()].some(k=>!['id','q','after','cursor','state'].includes(k))||['id','q','after','cursor','state'].some(k=>params.getAll(k).length>1))return Response.json({error:'Invalid request.'},{status:400,headers});
  const state=params.get('state'),id=params.get('id'),q=params.get('q')||'',after=params.get('after')||'',cursor=params.get('cursor')||'';
  if((state!==null&&state!=='1')||(state&&!id)||(state&&cursor)||q.length>100||after.length>1000||cursor.length>19||(id&&!/^[a-zA-Z0-9_-]{1,100}$/.test(id))||(cursor&&!/^\d+$/.test(cursor))||(id&&(q||after))||(!id&&cursor))return Response.json({error:'Invalid request.'},{status:400,headers});
  const path=id?`/api/internal/whatsapp/v1/conversations/${id}/${state?'operator':'messages'}`:'/api/internal/whatsapp/v1/conversations';
  const query=new URLSearchParams();if(id&&cursor)query.set('cursor',cursor);if(!id&&q)query.set('q',q);if(!id&&after)query.set('after',after);
  return Response.json(await inboxGateway(path+(query.size?'?'+query.toString():'')),{headers});
 }catch{return Response.json({error:'Conversations are temporarily unavailable. Please try again.'},{status:503,headers})}
}

export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'};if(!await isAdmin()||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403,headers});
 let action='';try{
  const body=JSON.parse(await boundedBody(request)) as Record<string,unknown>;action=String(body.action||'');const id=body.id;
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!['takeover','release','reply'].includes(action))return Response.json({error:'INVALID_COMMAND'},{status:400,headers});
  const allowed=action==='reply'?['id','action','command_id','revision','text']:['id','action','command_id','revision'];
  if(Object.keys(body).sort().join(',')!==allowed.sort().join(','))return Response.json({error:'INVALID_COMMAND'},{status:400,headers});
  const command={...body};delete command.id;
  return Response.json(await inboxGateway(`/api/internal/whatsapp/v1/conversations/${id}/operator`,fetch,command),{headers});
 }catch(e){const known=e instanceof InboxGatewayError;const unknown=action==='reply'&&(!known||e.status>=500);return Response.json({error:unknown?'REPLY_OUTCOME_UNCONFIRMED':known?e.code:'INBOX_UNAVAILABLE'},{status:known?e.status:503,headers});}
}
