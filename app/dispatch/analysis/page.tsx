import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import DispatchDashboard from '../../admin/dispatch/dispatch-dashboard';

export const dynamic='force-dynamic';
export default async function DispatchAnalysisPage(){
 if(!await isAdmin())redirect('/dispatch/login');
 return <DispatchDashboard/>;
}
