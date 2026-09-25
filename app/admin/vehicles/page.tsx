import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import FleetApp from '../fleet-app';
export default async function VehiclesPage(){if(!await isAdmin())redirect('/admin-login');return <FleetApp resource="vehicles"/>}
