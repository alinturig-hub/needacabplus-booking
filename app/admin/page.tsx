import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminApp from './admin-app';
export const dynamic='force-dynamic';
export default async function AdminPage(){if(!await isAdmin())redirect('/admin-login');return <AdminApp/>}
