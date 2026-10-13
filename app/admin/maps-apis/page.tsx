import Link from 'next/link';
import {redirect} from 'next/navigation';
import {Braces,Database,MapPinned,MessageSquare} from 'lucide-react';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import '../general-settings.css';
export const dynamic='force-dynamic';
export default async function MapsApisPage(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><main className="general-settings-page"><header><span className="eyebrow">GENERAL SETTINGS</span><h1>Maps & APIs</h1><p>Open the connection settings already used by bookings and Dispatch.</p></header><div className="general-settings-links"><Link href="/admin/configuration#maps"><MapPinned/><strong>Maps & places</strong><span>MapTiler, address search and map display</span></Link><Link href="/admin/configuration#api"><Braces/><strong>API connections</strong><span>Autocab endpoints and credentials</span></Link><Link href="/admin/configuration#taxicrm"><Database/><strong>TaxiCRM database</strong><span>Read-only booking and fleet access</span></Link><Link href="/admin/configuration#sms"><MessageSquare/><strong>SMS gateway</strong><span>Message transport and test tools</span></Link></div></main></AdminWorkspace>}
