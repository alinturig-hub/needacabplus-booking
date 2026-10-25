import {notFound,redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import CustomerSettings from '../../configuration/customer-settings';
import '../../configuration/configuration.css';
export const dynamic='force-dynamic';
export default async function CustomerModulePage({params}:{params:Promise<{section:string}>}){
 if(!await isAdmin())redirect('/admin-login');const {section}=await params;
 if(section==='memberships')redirect('/admin/configuration/membership');if(!['access'].includes(section))notFound();
 return <AdminWorkspace><main className="configuration-hub"><div className="configuration-panel"><span className="eyebrow">CUSTOMERS</span><h1>{section==='access'?'Customer access':'Memberships & services'}</h1>{section==='access'?<CustomerSettings section="identity"/>:null}</div></main></AdminWorkspace>;
}
