import {clearAdminSession} from '@/lib/security';

export async function GET(request:Request){
 await clearAdminSession();
 const host=(request.headers.get('x-forwarded-host')||new URL(request.url).hostname).split(',')[0].trim().split(':')[0].toLowerCase();
 if(host==='dispatch.needacabplus.app')return Response.redirect('https://dispatch.needacabplus.app/dispatch/login',303);
 if(host==='admin.needacabplus.app')return Response.redirect('https://admin.needacabplus.app/admin-login',303);
 return Response.redirect(new URL('/admin-login',request.url),303);
}
