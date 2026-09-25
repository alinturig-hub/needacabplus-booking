import {clearAdminSession} from '@/lib/security';

export async function GET(){
 await clearAdminSession();
 return Response.redirect('https://admin.needacabplus.app/admin-login',303);
}
