import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../../admin-workspace';
import DriverAppAccounts from './workspace';
import '../../../general-settings.css';
export const dynamic='force-dynamic';
export default async function DriverAppConfiguration(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><DriverAppAccounts/></AdminWorkspace>}
