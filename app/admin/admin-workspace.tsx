'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState, useSyncExternalStore, type ReactNode} from 'react';
import {Activity, BookOpen, CarFront, ChevronDown, ChevronRight, CreditCard, Database, LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, X} from 'lucide-react';
import {useAdminInterface} from './admin-interface';
import './admin-workspace.css';

type MenuItem = {label: string; href: string};
type MenuGroup = {id: string; label: string; icon: typeof BookOpen; items: MenuItem[]};

const groups: MenuGroup[] = [
  {id: 'bookings', label: 'Booking', icon: BookOpen, items: [
    {label: 'Booking rules', href: '/admin/configuration#bookings'},
    {label: 'Live overview', href: '/admin'},
    {label: 'Search bookings', href: '/admin/bookings'},
  ]},
  {id: 'fleet', label: 'Drivers / Vehicles', icon: CarFront, items: [
    {label: 'Drivers', href: '/admin/drivers'},
    {label: 'Vehicles', href: '/admin/vehicles'},
  ]},
  {id: 'general-settings', label: 'General Settings', icon: Settings2, items: [
    {label: 'Companies', href: '/admin/companies'},
    {label: 'Import & Export', href: '/admin/import-export'},
    {label: 'Maps & APIs', href: '/admin/maps-apis'},
    {label: 'User Interface', href: '/admin/interface'},
    {label: 'Users', href: '/admin/users'},
    {label: 'Webhooks', href: '/admin/configuration#webhooks'},
  ]},
  {id: 'settings', label: 'Other Settings', icon: Database, items: [
    {label: 'Customer sign-in', href: '/admin/configuration#identity'},
    {label: 'Dispatch rules', href: '/admin/configuration#dispatch'},
    {label: 'Security & 2FA', href: '/admin/configuration#general'},
    {label: 'SMS gateway', href: '/admin/configuration#sms'},
    {label: 'TaxiCRM database', href: '/admin/configuration#taxicrm'},
  ]},
  {id: 'pricing', label: 'Pricing & Payments', icon: CreditCard, items: [
    {label: 'Fares & promotions', href: '/admin/configuration#pricing'},
    {label: 'Payments', href: '/admin/configuration#payments'},
  ]},
];

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
  const currentItem = groups.flatMap(group => group.items).find(item => item.href === currentHref);
  const currentGroup = groups.find(group => group.items.some(item => item.href === currentHref));
  const pageTitle = currentItem?.label ?? (pathname === '/admin' ? 'Dashboard' : 'Settings');
  const sectionTitle = currentGroup?.label ?? 'Workspace';
  const close = () => setMobileOpen(false);

  return <div className={`admin-workspace-shell${interfaceSettings.density === 'compact' ? ' density-compact' : ''}${interfaceSettings.reduceMotion ? ' reduce-motion' : ''}`}>
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
        {groups.map(group => {
          const Icon = group.icon;
          const groupActive = group.items.some(item => item.href === currentHref);
          const open = expanded[group.id] ?? groupActive;
          return <div className="admin-workspace-group" key={group.id}>
            <button className={groupActive ? 'active' : ''} type="button" aria-expanded={open} onClick={() => setExpanded(current => ({...current, [group.id]: !open}))}>
              <Icon size={19}/><span>{group.label}</span>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
            </button>
            {open && <div className="admin-workspace-submenu">
              {group.items.map(item => {
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
        <Link className="admin-workspace-topbar-action" href="/dispatch" prefetch={false}><Activity size={16}/>Open Dispatch<ChevronRight size={15}/></Link>
      </header>
      {children}
    </div>
  </div>;
}
