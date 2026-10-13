import {redirect} from 'next/navigation';
import {isDispatchUser} from '@/lib/security';
import DispatchDashboard from '../../admin/dispatch/dispatch-dashboard';

export const dynamic='force-dynamic';
export default async function DispatchAnalysisPage(){
 if(!await isDispatchUser())redirect('/dispatch/login');
 return <DispatchDashboard/>;
}
