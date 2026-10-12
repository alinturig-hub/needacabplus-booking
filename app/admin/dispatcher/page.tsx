import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import DispatcherWorkspace from './workspace';

export default async function DispatcherPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <DispatcherWorkspace/>;
}
