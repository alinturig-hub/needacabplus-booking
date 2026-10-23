import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../../../../admin-workspace';
import ApiConnections from '../../../api-connections';
import WebhookProviders from '../../../webhook-providers';
import TaxiCrmDatabaseSettings from '../../../taxicrm-database-settings';
import AssistantClient from '../../../../assistant/assistant-client';
import {integrations} from '../../catalog';
import '../../../configuration.css';
export const dynamic='force-dynamic';
export default async function IntegrationSectionPage({params}:{params:Promise<{id:string;section:string}>}){
 if(!await isAdmin())redirect('/admin-login');
 const {id,section}=await params;const integration=integrations.find(item=>item.id===id);const selected=integration?.sections.find(item=>item.id===section);if(!integration||!selected)notFound();
 return <AdminWorkspace><main className="configuration-hub"><div className="configuration-panel"><Link href={'/admin/configuration/integrations/'+id}>← {integration.name}</Link><h1>{selected.name}</h1><p>{selected.description}</p>{id==='autocab'&&section==='api'&&<ApiConnections/>}{id==='autocab'&&section==='webhooks'&&<WebhookProviders/>}{id==='taxicrm'&&section==='data'&&<TaxiCrmDatabaseSettings/>}{id==='taxicrm'&&section==='ai'&&<AssistantClient/>}</div></main></AdminWorkspace>;
}
