import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import ImportExportApp from './transfer-app';
export const dynamic='force-dynamic';
export default async function ImportExportPage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><ImportExportApp/></AdminWorkspace>}
