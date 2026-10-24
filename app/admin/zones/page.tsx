import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import ZoneWorkspace from './workspace';
export const dynamic='force-dynamic';
export const metadata={referrer:'strict-origin' as const};
export default async function ZonesPage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><ZoneWorkspace/></AdminWorkspace>}
