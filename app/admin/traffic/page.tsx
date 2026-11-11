import Link from 'next/link';
import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import TrafficMap from './traffic-map';
export const dynamic='force-dynamic';
export default async function Page(){
 if(!await isAdmin())redirect('/admin-login?returnTo=/admin/traffic');
 return <AdminWorkspace><div style={{padding:'12px 24px'}}><Link href="/admin/traffic/route-preview">Test closure-aware route</Link></div><TrafficMap/></AdminWorkspace>;
}
