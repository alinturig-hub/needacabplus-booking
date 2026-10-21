import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminDashboard from './admin-dashboard';
import AdminWorkspace from './admin-workspace';
export const dynamic='force-dynamic';
export default async function AdminPage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><AdminDashboard/></AdminWorkspace>}
