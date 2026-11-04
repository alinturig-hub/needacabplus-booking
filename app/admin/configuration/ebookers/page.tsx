import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import EbookerSettings from './settings';
import './settings.css';
export const dynamic='force-dynamic';
export default async function Page(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><EbookerSettings/></AdminWorkspace>}
