import {isAdmin,sameOrigin} from '@/lib/security';
import {templateMediaBody} from '@/lib/notifications/template-media-body';
import {templateMediaWorkspace,TemplateWorkspaceError} from '@/lib/notifications/template-workspace';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 if(!await isAdmin()||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403,headers});
 try{return Response.json(await templateMediaWorkspace(await templateMediaBody(request)),{headers})}
 catch(e){return Response.json({error:e instanceof TemplateWorkspaceError?e.code:'TEMPLATE_MEDIA_UPLOAD_FAILED'},{status:e instanceof TemplateWorkspaceError?e.status:503,headers})}
}
