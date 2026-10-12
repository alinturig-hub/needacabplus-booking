import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminLogin from '../../admin-login/page';

export default async function DispatchLoginPage(){
 if(await isAdmin())redirect('/dispatch');
 return <AdminLogin destination="/dispatch"/>;
}
