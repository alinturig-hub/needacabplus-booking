import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import DispatchDashboard from './dispatch-dashboard';
export const dynamic='force-dynamic';
export default async function DispatchPage(){if(!await isAdmin())redirect('/admin-login');return <DispatchDashboard/>}
