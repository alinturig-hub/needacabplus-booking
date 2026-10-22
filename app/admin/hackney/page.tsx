import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import HackneyWorkspace from './workspace';
export const dynamic='force-dynamic';
export default async function HackneyPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><HackneyWorkspace/></AdminWorkspace>;
}
