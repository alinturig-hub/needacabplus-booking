import {redirect} from 'next/navigation';
import {isAdmin} from '@/lib/security';
import AdminWorkspace from '../admin-workspace';
import {DispatchSettings} from '../configuration/operations-settings';
import '../configuration/configuration.css';
import NativeDispatchRules from './native-rules';
import './native-rules.css';
export const dynamic='force-dynamic';
export default async function DispatchRulesPage(){
 if(!await isAdmin())redirect('/admin-login');
 return <AdminWorkspace><main className="configuration-hub"><div className="configuration-panel"><span className="eyebrow">DISPATCH / CONFIGURATION</span><h1>Dispatch rules & simulation</h1><p>Configure dispatch behaviour here. Dispatchers manage live jobs in <a href="https://dispatch.needacabplus.app/" target="_blank" rel="noopener noreferrer">the Dispatch application ↗</a>.</p><NativeDispatchRules/><details><summary>Existing travel-time / pre-book simulation</summary><DispatchSettings/></details></div></main></AdminWorkspace>;
}
