'use client';
import Link from 'next/link';
import {ArrowLeft,Braces,CheckCircle2,CloudCog,KeyRound,LogOut,Radio,ShieldCheck,Webhook} from 'lucide-react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import ApiConnections from './api-connections';
import WebhookProviders from './webhook-providers';

function Status({children,tone='pending'}:{children:React.ReactNode;tone?:'pending'|'ready'}){
 return <span className={`config-status ${tone}`}><span/>{children}</span>;
}

export default function ConfigurationApp(){
 return <main className="admin-shell">
  <header className="brandbar">
   <Link className="brand" href="/"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link>
   <nav className="admin-nav" aria-label="Admin navigation"><Link href="/admin">Bookings</Link><Link className="active" href="/admin/configuration">Configuration</Link></nav>
   <a className="admin-link" href="/api/admin/logout"><LogOut size={16}/>Sign out</a>
  </header>
  <div className="admin-body configuration-body">
   <div className="admin-title"><div><span className="eyebrow">ADMINISTRATION</span><h1>Configuration.</h1><p className="muted">Connect Autocab and manage how booking events enter Need A Cab Plus.</p></div><Link className="text-link" href="/admin"><ArrowLeft size={16}/>Back to bookings</Link></div>
   <div className="config-provider">
    <aside className="provider-summary">
     <div className="provider-logo"><CloudCog size={31}/></div>
     <span className="eyebrow">DISPATCH INTEGRATION</span>
     <h2>Autocab</h2>
     <p>One central connection for webhook events, API access and inbound data.</p>
     <Status>Setup in progress</Status>
     <dl><div><dt>Provider</dt><dd>Autocab</dd></div><div><dt>Environment</dt><dd>Production</dd></div><div><dt>Data store</dt><dd>Need A Cab Event DB</dd></div></dl>
    </aside>
    <section className="provider-settings">
     <div className="settings-heading"><div><span className="eyebrow">AUTOCAB</span><h2>Connection settings</h2></div><ShieldCheck size={25}/></div>
     <Tabs defaultValue="webhook" className="integration-tabs">
      <TabsList><TabsTrigger value="webhook"><Webhook/>Webhook</TabsTrigger><TabsTrigger value="api"><Braces/>API</TabsTrigger><TabsTrigger value="inbound"><Radio/>Inbound</TabsTrigger></TabsList>
      <TabsContent value="webhook">
       <WebhookProviders/>
      </TabsContent>
      <TabsContent value="api">
       <ApiConnections/>
      </TabsContent>
      <TabsContent value="inbound">
       <div className="config-section-title"><div className="config-icon"><Radio/></div><div><h3>Need A Cab Inbound</h3><p>Receives events from approved external systems using the shared event schema.</p></div><Status tone="ready">Domain added</Status></div>
       <div className="endpoint-box"><span>INBOUND ENDPOINT</span><code>https://inbound.needacabplus.app/events</code><small>Each source will receive its own signing secret and event permissions.</small></div>
       <div className="config-grid"><article><CheckCircle2/><div><strong>Shared schema</strong><p>Webhook and inbound sources use the same event envelope.</p></div><Status tone="ready">Defined</Status></article><article><KeyRound/><div><strong>Source keys</strong><p>Create and revoke a separate key for every connected system.</p></div><Status>Pending build</Status></article></div>
      </TabsContent>
     </Tabs>
    </section>
   </div>
  </div>
 </main>;
}
