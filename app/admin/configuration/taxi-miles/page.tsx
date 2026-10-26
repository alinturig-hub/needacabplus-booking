import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import TaxiMilesWorkspace from './workspace';
import '../configuration.css';
export const dynamic='force-dynamic';
export default async function TaxiMilesPage({searchParams}:{searchParams:Promise<{panel?:string}>}){if(!await isAdmin())redirect('/admin-login');const{panel}=await searchParams;return <AdminWorkspace><TaxiMilesWorkspace initialPanel={panel}/></AdminWorkspace>}
