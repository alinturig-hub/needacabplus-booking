import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import DriverLiveMap from '../../admin/driver-live-map';

export const dynamic='force-dynamic';
export default async function DispatchMapPage(){
 if(!await isAdmin())redirect('/dispatch/login');
 return <DriverLiveMap/>;
}
