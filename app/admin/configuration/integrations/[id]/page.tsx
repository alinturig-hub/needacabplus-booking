import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import {taxiCrmAppUrl} from '@/lib/admin-links';
import AdminWorkspace from '../../../admin-workspace';
import {integrations} from '../catalog';
import '../../../category/[id]/category.css';
export const dynamic='force-dynamic';
export default async function IntegrationPage({params}:{params:Promise<{id:string}>}){
 if(!await isAdmin())redirect('/admin-login');
 const {id}=await params;const integration=integrations.find(item=>item.id===id);if(!integration)notFound();
 return <AdminWorkspace><main className="admin-category-page"><div className="admin-category-breadcrumb"><Link href="/admin/configuration/integrations">Integrations</Link><span> / {integration.name}</span></div><header className="admin-category-intro"><div><span className="eyebrow">INTEGRATION MODULE</span><h1>{integration.name}</h1><p>{integration.description}</p></div></header><div className="admin-category-grid">{integration.sections.map(section=><Link className="admin-category-card" key={section.id} href={`/admin/configuration/integrations/${id}/${section.id}`}><h2>{section.name}</h2><p>{section.description}</p><strong>Open submodule →</strong></Link>)}</div>{id==='taxicrm'&&taxiCrmAppUrl()&&<p><a href={taxiCrmAppUrl()!} target="_blank" rel="noopener noreferrer">Open TaxiCRM ↗</a></p>}{id==='autocab'&&<p>Webhook links are generated here for Autocab to send events to us. Keep existing links and credentials unchanged unless updating the corresponding Autocab configuration.</p>}</main></AdminWorkspace>;
}
