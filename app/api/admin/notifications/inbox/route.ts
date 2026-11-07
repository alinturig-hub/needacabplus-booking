import {isAdmin} from '@/lib/security';
import {inboxGateway} from '@/lib/notifications/inbox-gateway';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(!await isAdmin())return Response.json({error:'Admin access required.'},{status:403,headers});
 try{
  const params=new URL(request.url).searchParams;
  if([...params.keys()].some(k=>!['id','q','after','cursor'].includes(k))||['id','q','after','cursor'].some(k=>params.getAll(k).length>1))return Response.json({error:'Invalid request.'},{status:400,headers});
  const id=params.get('id'),q=params.get('q')||'',after=params.get('after')||'',cursor=params.get('cursor')||'';
  if(q.length>100||after.length>1000||cursor.length>19||(id&&!/^[a-zA-Z0-9_-]{1,100}$/.test(id))||(cursor&&!/^\d+$/.test(cursor))||(id&&(q||after))||(!id&&cursor))return Response.json({error:'Invalid request.'},{status:400,headers});
  const path=id?`/api/internal/whatsapp/v1/conversations/${id}/messages`:'/api/internal/whatsapp/v1/conversations';
  const query=new URLSearchParams();if(id&&cursor)query.set('cursor',cursor);if(!id&&q)query.set('q',q);if(!id&&after)query.set('after',after);
  return Response.json(await inboxGateway(path+(query.size?'?'+query.toString():'')),{headers});
 }catch{return Response.json({error:'Conversations are temporarily unavailable. Please try again.'},{status:503,headers})}
}
