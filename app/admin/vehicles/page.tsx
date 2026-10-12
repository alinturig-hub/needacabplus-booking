import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import FleetApp from '../fleet-app';
import AdminWorkspace from '../admin-workspace';
export default async function VehiclesPage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><FleetApp resource="vehicles"/></AdminWorkspace>}
