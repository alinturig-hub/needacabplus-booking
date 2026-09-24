import {clearAdminSession} from '@/lib/security';

export async function GET(request:Request){
 await clearAdminSession();
 return Response.redirect(new URL('/admin-login',request.url));
}
