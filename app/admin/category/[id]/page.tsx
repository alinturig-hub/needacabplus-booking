import Link from 'next/link';
import {notFound, redirect} from 'next/navigation';
import {ArrowUpRight, ChevronRight} from 'lucide-react';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import {adminMenuGroups,legacyAdminCategories} from '../../admin-menu';
import './category.css';

export const dynamic = 'force-dynamic';

export default async function AdminCategoryPage({params}: {params: Promise<{id: string}>}) {
  if (!await isAdmin()) redirect('/admin-login');
  const {id} = await params;
  if(legacyAdminCategories[id])redirect(legacyAdminCategories[id]);
  const group = adminMenuGroups.find(item => item.id === id);
  if (!group) notFound();
  const Icon = group.icon;

  return <AdminWorkspace><main className="admin-category-page">
    <div className="admin-category-breadcrumb"><Link href="/admin">Admin</Link><ChevronRight size={16}/><span>{group.label}</span></div>
    <header className="admin-category-intro">
      <span className="admin-category-intro-icon"><Icon size={26}/></span>
      <div><span className="eyebrow">MODULE WORKSPACE</span><h1>{group.label}</h1><p>{group.description}</p></div>
    </header>
    <div className="admin-category-grid">
      {group.items.map((item, index) => {
        const content = <><div className="admin-category-card-top"><span>{String(index + 1).padStart(2, '0')}</span><ArrowUpRight size={19}/></div><h2>{item.label}</h2><p>{item.description}</p><strong>Open workspace <span aria-hidden="true">→</span></strong></>;
        return item.href.includes('#')
          ? <a key={item.href} className="admin-category-card" href={item.href}>{content}</a>
          : <Link key={item.href} className="admin-category-card" href={item.href}>{content}</Link>;
      })}
    </div>
  </main></AdminWorkspace>;
}
