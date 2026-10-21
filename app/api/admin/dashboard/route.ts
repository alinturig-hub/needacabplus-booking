import {isAdmin} from '@/lib/security';
import {adminDashboardSummary} from '@/lib/admin-dashboard';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{return Response.json(await adminDashboardSummary(),{headers:{'Cache-Control':'private, no-store'}})}
 catch{return Response.json({error:'Unable to load the dashboard.'},{status:503})}
}
