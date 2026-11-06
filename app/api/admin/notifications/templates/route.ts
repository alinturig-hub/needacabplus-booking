import {isAdmin,sameOrigin} from '@/lib/security';
import {boundedBody} from '@/lib/whatsapp-service-auth';
import {templateWorkspace,templateWorkspacePublicFailure} from '@/lib/notifications/template-workspace';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){if(!await isAdmin())return Response.json({error:'Admin access required.'},{status:403,headers});try{return Response.json(await templateWorkspace({action:'capabilities'}),{headers})}catch{return Response.json({manage:false,inPlaceEdit:false,available:false},{headers})}}
export async function POST(request:Request){
 if(!await isAdmin()||!sameOrigin(request))return Response.json({error:'Admin access required.'},{status:403,headers});
 let action='';
 try{const input=JSON.parse(await boundedBody(request));action=input?.action;
 if(!input||!['preview','list','submit'].includes(action))return Response.json({error:'IN_PLACE_EDIT_UNAVAILABLE_USE_NEW_VERSION'},{status:409,headers});
 return Response.json(await templateWorkspace(input),{headers});
 }catch(e){
 const failure=templateWorkspacePublicFailure(action,e);
 return Response.json({error:failure.error},{status:failure.status,headers});
 }
}
