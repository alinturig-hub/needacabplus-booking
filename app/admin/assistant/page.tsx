import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import AssistantClient from './assistant-client';

export const dynamic='force-dynamic';
export default async function AssistantPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><AssistantClient/></AdminWorkspace>;
}
