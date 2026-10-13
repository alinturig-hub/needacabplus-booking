import {redirect} from 'next/navigation';
import {isDispatchUser} from '@/lib/security';
import DriverLiveMap from '../../admin/driver-live-map';

export const dynamic='force-dynamic';
export default async function DispatchMapPage(){
 if(!await isDispatchUser())redirect('/dispatch/login');
 return <DriverLiveMap/>;
}
