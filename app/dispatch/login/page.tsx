import {redirect} from 'next/navigation';
import {isDispatchUser} from '@/lib/security';
import AdminLogin from '../../admin-login/page';

export default async function DispatchLoginPage(){
 if(await isDispatchUser())redirect('/dispatch');
 return <AdminLogin destination="/dispatch"/>;
}
