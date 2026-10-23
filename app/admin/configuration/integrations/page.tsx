import Link from 'next/link';
import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import {integrations} from './catalog';
import '../../category/[id]/category.css';
export const dynamic='force-dynamic';
export default async function IntegrationsPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><main className="admin-category-page"><header className="admin-category-intro"><div><span className="eyebrow">CONFIGURATION / INTEGRATIONS</span><h1>Integrations</h1><p>Open an integration to configure its submodules. Existing connections and incoming event URLs are preserved.</p></div></header><div className="admin-category-grid">{integrations.map(item=><Link key={item.id} className="admin-category-card" href={'/admin/configuration/integrations/'+item.id}><h2>{item.name}</h2><p>{item.description}</p><strong>Open integration →</strong></Link>)}</div></main></AdminWorkspace>;
}
