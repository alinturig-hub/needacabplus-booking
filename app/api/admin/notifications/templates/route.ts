import {isAdmin,sameOrigin} from '@/lib/security';
import {boundedBody} from '@/lib/whatsapp-service-auth';
import {templateWorkspace} from '@/lib/notifications/template-workspace';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!await isAdmin()||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403});
 try{const input=JSON.parse(await boundedBody(request));if(!input||!['preview','list'].includes(input.action))return Response.json({error:'Meta changes are disabled in stage one.'},{status:409});
 return Response.json(await templateWorkspace(input),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Shared template workspace is unavailable. No Meta changes were made.'},{status:503})}
}
