import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import RoadworksOperations from './workspace';
export const dynamic='force-dynamic';
export default async function Page(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><RoadworksOperations/></AdminWorkspace>;
}
