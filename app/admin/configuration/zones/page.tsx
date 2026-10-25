import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import ZoneWorkspace from '../../zones/workspace';
export const dynamic='force-dynamic';
export const metadata={referrer:'strict-origin' as const};
export default async function ZonesConfigurationPage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><ZoneWorkspace/></AdminWorkspace>}
