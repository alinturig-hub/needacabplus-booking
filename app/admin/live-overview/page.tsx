import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminApp from '../admin-app';
import AdminWorkspace from '../admin-workspace';
export const dynamic='force-dynamic';
export default async function LiveOverviewPage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><AdminApp/></AdminWorkspace>}
