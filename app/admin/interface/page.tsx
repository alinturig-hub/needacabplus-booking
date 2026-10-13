import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import InterfaceApp from './interface-app';
export const dynamic='force-dynamic';
export default async function InterfacePage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><InterfaceApp/></AdminWorkspace>}
