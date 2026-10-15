'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState, useSyncExternalStore, type ReactNode} from 'react';
import {Activity, ChevronDown, ChevronRight, LayoutDashboard, LogOut, Menu, Moon, ShieldCheck, Sun, X} from 'lucide-react';
import {saveAdminInterface, useAdminInterface} from './admin-interface';
import {adminMenuGroups} from './admin-menu';
import './admin-workspace.css';

function subscribeHash(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export default function AdminWorkspace({children}: {children: ReactNode}) {
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  const interfaceSettings = useAdminInterface();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({bookings: true, 'general-settings': true});
  const currentHref = pathname + hash;
  const currentItem = adminMenuGroups.flatMap(group => group.items).find(item => item.href === currentHref);
  const categoryGroup = adminMenuGroups.find(group => pathname === `/admin/category/${group.id}`);
  const currentGroup = categoryGroup ?? adminMenuGroups.find(group => group.items.some(item => item.href === currentHref));
  const pageTitle = categoryGroup?.label ?? currentItem?.label ?? (pathname === '/admin' ? 'Dashboard' : 'Settings');
  const sectionTitle = currentGroup?.label ?? 'Workspace';
  const close = () => setMobileOpen(false);

  return <div className={`admin-workspace-shell theme-${interfaceSettings.theme}${interfaceSettings.density === 'compact' ? ' density-compact' : ''}${interfaceSettings.reduceMotion ? ' reduce-motion' : ''}`}>
    {mobileOpen && <button className="admin-workspace-backdrop" type="button" aria-label="Close Admin menu" onClick={close}/>}
    <aside className={`admin-workspace-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label="Admin menu">
      <div className="admin-workspace-brand">
        <Link href="/admin" onClick={close} aria-label="Need A Cab Plus Admin home">
          <span className="admin-workspace-mark">N<span>+</span></span>
          <span className="admin-workspace-brand-copy">NEED A CAB <b>PLUS</b><small>ADMIN WORKSPACE</small></span>
        </Link>
        <button type="button" className="admin-workspace-close" aria-label="Close menu" onClick={close}><X size={19}/></button>
      </div>
      <nav aria-label="Admin sections">
        <span className="admin-workspace-nav-label">WORKSPACE</span>
        <Link className={`admin-workspace-home${pathname === '/admin' ? ' active' : ''}`} href="/admin" onClick={close} aria-current={pathname === '/admin' ? 'page' : undefined}>
          <LayoutDashboard size={19}/><span>Dashboard</span>
        </Link>
        <span className="admin-workspace-nav-label admin-workspace-nav-label-spaced">MANAGEMENT</span>
        {adminMenuGroups.map(group => {
          const Icon = group.icon;
          const groupActive = categoryGroup?.id === group.id || group.items.some(item => item.href === currentHref);
          const open = expanded[group.id] ?? groupActive;
          return <div className="admin-workspace-group" key={group.id}>
            <div className={`admin-workspace-group-heading${groupActive ? ' active' : ''}`}>
              <Link href={`/admin/category/${group.id}`} onClick={() => {setExpanded(current => ({...current, [group.id]: true})); close();}} aria-current={categoryGroup?.id === group.id ? 'page' : undefined}>
                <Icon size={19}/><span>{group.label}</span>
              </Link>
              <button type="button" aria-label={`${open ? 'Collapse' : 'Expand'} ${group.label}`} aria-expanded={open} onClick={() => setExpanded(current => ({...current, [group.id]: !open}))}>
                {open ? <ChevronDown size={17}/> : <ChevronRight size={17}/>}
              </button>
            </div>
            {open && <div className="admin-workspace-submenu">
              {group.items.filter(item => !item.categoryOnly).map(item => {
                const current = item.href === currentHref;
                return item.href.includes('#')
                  ? <a key={item.href} href={item.href} onClick={close} aria-current={current ? 'page' : undefined}>{item.label}</a>
                  : <Link key={item.href} href={item.href} onClick={close} aria-current={current ? 'page' : undefined}>{item.label}</Link>;
              })}
            </div>}
          </div>;
        })}
        <span className="admin-workspace-nav-label admin-workspace-nav-label-spaced">OPERATIONS</span>
        <Link className="admin-workspace-dispatch" href="/dispatch" prefetch={false} onClick={close}>
          <Activity size={19}/><span>Open Dispatch</span><ChevronRight size={16}/>
        </Link>
      </nav>
      <div className="admin-workspace-sidebar-footer">
        <span><ShieldCheck size={15}/> Secured Admin access</span>
        <Link href="/api/admin/logout" prefetch={false}><LogOut size={17}/>Sign out</Link>
      </div>
    </aside>
    <div className="admin-workspace-content">
      <header className="admin-workspace-topbar">
        <div className="admin-workspace-location">
          <button className="admin-workspace-mobile-toggle" type="button" onClick={() => setMobileOpen(true)} aria-label="Open Admin menu" aria-expanded={mobileOpen}><Menu size={21}/></button>
          <span className="admin-workspace-location-icon"><LayoutDashboard size={17}/></span>
          <span className="admin-workspace-location-copy"><small>ADMIN / {sectionTitle.toUpperCase()}</small><strong>{pageTitle}</strong></span>
        </div>
        <div className="admin-workspace-topbar-actions">
          <button className="admin-workspace-theme-toggle" type="button" onClick={() => saveAdminInterface({...interfaceSettings, theme: interfaceSettings.theme === 'dark' ? 'light' : 'dark'})} aria-label={`Switch to ${interfaceSettings.theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${interfaceSettings.theme === 'dark' ? 'Light' : 'Dark'} theme`}>
            {interfaceSettings.theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}<span>{interfaceSettings.theme === 'dark' ? 'Light' : 'Dark'} mode</span>
          </button>
          <Link className="admin-workspace-topbar-action" href="/dispatch" prefetch={false}><Activity size={16}/>Open Dispatch<ChevronRight size={15}/></Link>
        </div>
      </header>
      {children}
    </div>
  </div>;
}
