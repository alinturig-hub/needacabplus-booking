import {isAdmin} from '@/lib/security';
import {redirect} from 'next/navigation';
import RoutePreview from './preview';
export default async function Page(){if(!await isAdmin())redirect('/admin/login');return <RoutePreview/>;}
