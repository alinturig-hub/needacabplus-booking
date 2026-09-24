import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import ConfigurationApp from './configuration-app';

export const dynamic='force-dynamic';

export default async function ConfigurationPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <ConfigurationApp/>;
}
