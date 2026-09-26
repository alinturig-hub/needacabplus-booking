import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import DriverLiveMap from '../driver-live-map';

export const dynamic='force-dynamic';
export default async function LiveMapPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <DriverLiveMap/>;
}
