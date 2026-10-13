import {redirect} from 'next/navigation';
import {isDispatchUser} from '@/lib/security';
import DispatcherWorkspace from '../admin/dispatcher/workspace';

export const dynamic='force-dynamic';
export default async function DispatchPage(){
 if(!await isDispatchUser())redirect('/dispatch/login');
 return <DispatcherWorkspace/>;
}
