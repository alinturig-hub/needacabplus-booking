import Link from 'next/link';
import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../admin-workspace';
import '../../category/[id]/category.css';
export const dynamic='force-dynamic';
export default async function ApplicationsPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><main className="admin-category-page"><header className="admin-category-intro"><div><span className="eyebrow">CONFIGURATION / APPLICATIONS</span><h1>Applications</h1><p>Passenger and driver applications have separate access and share the platform backend. Android and iOS releases will be configured separately.</p></div></header><div className="admin-category-grid"><article className="admin-category-card"><h2>Passenger App</h2><p>Existing passenger web application: booking, pickup selection, payments and memberships.</p><a href="https://webapp.needacabplus.app/" target="_blank" rel="noopener noreferrer">Open Passenger App ↗</a><p><Link href="/admin/configuration#bookings">Booking & payment rules →</Link></p><p><Link href="/admin/customers/access">Customer sign-in →</Link></p></article><article className="admin-category-card"><h2>Driver App</h2><strong>Pilot · Training jobs</strong><p><a href="https://drivers.needacabplus.app/" target="_blank" rel="noopener noreferrer">Open Driver App ↗</a></p><p><Link href="/admin/configuration/apps/driver">Driver accounts & invitations →</Link></p><p>Driver sign-in, foreground GPS and the training workflow are available. Real customer dispatch, background GPS, earnings and payments still need integration.</p><Link href="/admin/dispatch-rules">Configure & simulate dispatch rules →</Link></article></div></main></AdminWorkspace>;
}
