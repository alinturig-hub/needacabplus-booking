import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import CompaniesApp from './companies-app';
export const dynamic='force-dynamic';
export default async function CompaniesPage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><CompaniesApp/></AdminWorkspace>}
