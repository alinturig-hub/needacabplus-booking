import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import TrafficMap from './traffic-map';
export const dynamic='force-dynamic';
export default async function Page(){
 if(!await isAdmin())redirect('/admin-login?returnTo=/admin/traffic');
 return <AdminWorkspace><TrafficMap/></AdminWorkspace>;
}
