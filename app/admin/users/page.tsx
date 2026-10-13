import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import UsersApp from './users-app';

export const dynamic='force-dynamic';
export default async function UsersPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><UsersApp/></AdminWorkspace>;
}
