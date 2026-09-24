'use client';
import Link from 'next/link';
import {Activity,ArrowLeft,Braces,CheckCircle2,CloudCog,Database,Globe2,KeyRound,LogOut,Radio,Route,ShieldCheck,Webhook} from 'lucide-react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';

const fields=[
 ['bookingId','booking.external_id'],
 ['telephone','customer.phone'],
 ['pickup.address','journey.pickup.address'],
 ['destination.address','journey.destination.address'],
];

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
       <div className="config-section-title"><div className="config-icon"><Webhook/></div><div><h3>Autocab Webhook</h3><p>Receives events sent by Autocab and stores the original payload.</p></div><Status tone="ready">Domain added</Status></div>
       <div className="endpoint-box"><span>EVENT ENDPOINT</span><code>https://webhook.needacabplus.app/events/autocab</code><small>The receiver will validate, store and normalize each Autocab event.</small></div>
       <div className="config-grid"><article><Globe2/><div><strong>Source authentication</strong><p>Signature or shared secret will be configured when Autocab credentials are available.</p></div><Status>Pending</Status></article><article><Database/><div><strong>Raw event storage</strong><p>Keep the original request for audit, diagnostics and replay.</p></div><Status>Pending build</Status></article></div>
       <div className="mapping-preview"><div><Route/><div><strong>Initial field mapping</strong><p>Autocab fields will be translated into the shared Need A Cab Plus event schema.</p></div></div>{fields.map(([source,target])=><div className="mapping-row" key={source}><code>{source}</code><span>→</span><code>{target}</code></div>)}</div>
      </TabsContent>
      <TabsContent value="api">
       <div className="config-section-title"><div className="config-icon"><Braces/></div><div><h3>Autocab API</h3><p>Completes booking, driver and vehicle data when a webhook does not contain everything required.</p></div><Status>Not connected</Status></div>
       <div className="credential-list"><div><span>API base URL</span><strong>Waiting for Autocab details</strong><Globe2/></div><div><span>Account / tenant</span><strong>Not configured</strong><Activity/></div><div><span>API credentials</span><strong>Stored encrypted when connected</strong><KeyRound/></div></div>
       <div className="config-note"><ShieldCheck/><p>No API key has been entered. Credentials will be stored only as protected server variables and will never be shown in booking or event logs.</p></div>
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
