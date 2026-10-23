import Link from 'next/link';
import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import {adminMenuGroups} from '../../admin-menu';
import {integrations} from '../../configuration/integrations/catalog';
import '../../category/[id]/category.css';
export const dynamic='force-dynamic';
export default async function ModulesPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><main className="admin-category-page"><header className="admin-category-intro"><div><span className="eyebrow">SETTINGS / MODULES</span><h1>Modules</h1><p>The module structure is ready to configure. Activation, dependencies and access policies are the next setup step; this catalogue does not change current services or data collection.</p></div></header><h2>Workspace modules</h2><div className="admin-category-grid"><Link className="admin-category-card" href="/admin"><h2>Overview</h2><p>Business status and administrator priorities.</p><strong>Open workspace →</strong></Link>{adminMenuGroups.map(module=><Link key={module.id} className="admin-category-card" href={'/admin/category/'+module.id}><h2>{module.label}</h2><p>{module.description}</p><small>{module.items.length} submodules</small><strong>Open module →</strong></Link>)}</div><h2>Integration modules</h2><div className="admin-category-grid">{integrations.map(module=><Link className="admin-category-card" key={module.id} href={'/admin/configuration/integrations/'+module.id}><h2>{module.name}</h2><p>{module.description}</p><strong>Configure integration →</strong></Link>)}</div></main></AdminWorkspace>;
}
