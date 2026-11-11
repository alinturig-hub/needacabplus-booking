import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import {redirect} from 'next/navigation';
import RoutePreview from './preview';
export default async function Page(){if(!await isAdmin())redirect('/admin-login?returnTo=/admin/traffic/route-preview');return <AdminWorkspace><RoutePreview/></AdminWorkspace>;}
