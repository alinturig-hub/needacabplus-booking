'use client';
import {useEffect,useState} from 'react';
import {CheckCircle2,Database,RefreshCw,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {TaxiCrmDatabaseSnapshot} from '@/lib/taxicrm-database';

function number(value:number){return new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(value)}
function bytes(value:number){if(value<1024)return `${value} B`;const units=['KB','MB','GB','TB'];let size=value/1024,index=0;while(size>=1024&&index<units.length-1){size/=1024;index++}return `${size.toFixed(size>=10?1:2)} ${units[index]}`}

export default function TaxiCrmDatabaseSettings(){
 const [configured,setConfigured]=useState<boolean|null>(null),[checking,setChecking]=useState(false),[snapshot,setSnapshot]=useState<TaxiCrmDatabaseSnapshot|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetch('/api/admin/taxicrm-database',{cache:'no-store'}).then(async response=>{const data=await response.json() as {configured?:boolean;error?:string};if(!response.ok)throw new Error(data.error||'Unable to read TaxiCRM connection status.');if(active)setConfigured(Boolean(data.configured))}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Unable to read TaxiCRM connection status.')});return()=>{active=false}},[]);
 async function verify(){setChecking(true);setError('');try{const response=await fetch('/api/admin/taxicrm-database',{method:'POST'}),data=await response.json() as {configured?:boolean;snapshot?:TaxiCrmDatabaseSnapshot;error?:string};setConfigured(Boolean(data.configured));if(!response.ok||!data.snapshot)throw new Error(data.error||'TaxiCRM database verification failed.');setSnapshot(data.snapshot)}catch(reason){setError(reason instanceof Error?reason.message:'TaxiCRM database verification failed.')}finally{setChecking(false)}}
 return <section className="operations-settings customer-settings taxicrm-database-settings"><header className="customer-settings-heading"><h3>TaxiCRM database</h3><p>Permanent read-only access to TaxiCRM. Booking data stays in its source database and is not copied into Need A Cab Plus.</p></header>
  <section className="taxicrm-connection-card"><header><span className="map-settings-icon"><Database/></span><div><h4>Production connection</h4><p>Uses a dedicated PostgreSQL reader with short query timeouts and a small connection pool.</p></div><span className={`taxicrm-status ${snapshot?.readOnly?'connected':configured?'configured':'missing'}`}>{snapshot?.readOnly?<><CheckCircle2/>Connected · read-only</>:configured?'Configured':'Not configured'}</span></header>
   <div className="customer-settings-actions"><Button type="button" onClick={verify} disabled={checking||configured===null}>{checking?<><RefreshCw className="spin"/>Checking…</>:<><RefreshCw/>Verify connection</>}</Button><span>Runs catalog checks only. It does not scan or copy booking rows.</span></div>
  </section>
  {snapshot&&<><div className="taxicrm-summary"><article><span>Database</span><strong>{snapshot.database}</strong><small>{snapshot.user}</small></article><article><span>Tables</span><strong>{number(snapshot.tableCount)}</strong><small>{number(snapshot.schemaCount)} schemas</small></article><article><span>Estimated rows</span><strong>{number(snapshot.estimatedRows)}</strong><small>PostgreSQL statistics</small></article><article><span>Storage</span><strong>{bytes(snapshot.totalSizeBytes)}</strong><small>tables and indexes</small></article></div>
   <section className="taxicrm-table-list"><header><div><h4>Largest mapped tables</h4><p>Metadata only. We will choose the booking mapping after reviewing this schema together.</p></div><small>Checked {new Date(snapshot.checkedAt).toLocaleString('en-GB')}</small></header><div>{snapshot.tables.slice(0,20).map(table=><article key={`${table.schema}.${table.table}`}><code>{table.schema}.{table.table}</code><span>{number(table.estimatedRows)} estimated rows</span><small>{bytes(table.sizeBytes)}</small></article>)}</div></section></>}
  <p className="customer-settings-hint"><ShieldCheck/> The application rejects the connection if the PostgreSQL role has administrative or schema-write privileges.</p>
  {error&&<p className="error-message" role="alert">{error}</p>}
 </section>;
}
