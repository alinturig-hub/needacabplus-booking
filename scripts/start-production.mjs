import {readFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import pg from 'pg';

const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
if(process.env.DATABASE_SCHEMA_MANAGED_EXTERNALLY==='true'&&process.env.NAC_GRANT_DATABASE_URL){
 const migration=spawnSync(process.execPath,['scripts/migrate-local-drivers.mjs'],{stdio:'inherit',env:process.env});
 if(migration.status!==0)console.error('Local driver management will remain unavailable until the schema migration succeeds.');
}
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
function retentionDays(){const value=Number(process.env.DRIVER_POSITION_RETENTION_DAYS||90);return Number.isFinite(value)&&value>0?Math.floor(value):90}
const externalSchema=process.env.DATABASE_SCHEMA_MANAGED_EXTERNALLY==='true';
const retainPositions=process.env.DRIVER_POSITION_RETENTION_ENABLED==='true'||
 (!externalSchema&&process.env.DRIVER_POSITION_RETENTION_ENABLED!=='false');
try{
 if(!externalSchema){
  await pool.query(await readFile(new URL('../db/init.sql',import.meta.url),'utf8'));
 }
 try{const {normalizeApiConnections}=await import('./normalize-api-connections.mjs');console.log('API connection normalization',await normalizeApiConnections(pool))}catch(error){console.error('API connection normalization skipped',typeof error?.code==='string'?error.code:'configuration-error')}
 if(retainPositions){
  await pool.query('DELETE FROM driver_positions WHERE COALESCE(recorded_at,received_at)<now()-make_interval(days=>$1)',[retentionDays()]);
 }
}
finally{await pool.end()}

const child=spawn(process.execPath,['server.js'],{stdio:'inherit',env:process.env});
if(process.env.TAXICRM_BOOTSTRAP_DATABASE_URL||process.env.TAXICRM_READER_PASSWORD){
 void import('./bootstrap-taxicrm-reader.mjs').then(({bootstrapTaxiCrmReader})=>bootstrapTaxiCrmReader()).catch(error=>console.error(`TaxiCRM bootstrap failed (${typeof error?.code==='string'?error.code:error instanceof Error?error.name:'unknown'}).`));
}
// One resumable, versioned audit requested by the operator; never writes to Autocab.
let audit,retryTimer,closing=false,retries=0;
function launchAudit(){
 audit=spawn(process.execPath,['scripts/audit-bookings.mjs'],{stdio:'inherit',env:process.env});
 audit.on('error',()=>console.error('Booking audit process could not start.'));
 audit.on('exit',code=>{if(!closing&&code!==0&&retries++<3)retryTimer=setTimeout(launchAudit,60000)});
}
if(process.env.TAXICRM_BOOKINGS_READ_ENABLED!=='true')launchAudit();
let reconciliation,reconciliationTimer;
function launchReconciliation(){
 reconciliation=spawn(process.execPath,['scripts/reconcile-bookings.mjs'],{stdio:'inherit',env:process.env});
 reconciliation.on('error',()=>console.error('Booking status synchronization could not start.'));
 reconciliation.on('exit',()=>{if(!closing)reconciliationTimer=setTimeout(launchReconciliation,60000)});
}
if(process.env.TAXICRM_BOOKINGS_READ_ENABLED!=='true')launchReconciliation();
let bookingWriterTimer,bookingWriterBusy=false;
async function pollCanonicalBookings(){
 if(closing||bookingWriterBusy||process.env.CANONICAL_BOOKING_WRITER_ENABLED!=='true')return;
 const secret=process.env.BOOKING_WRITER_JOB_SECRET;
 if(!secret){console.error('Booking writer job secret is missing.');return}
 bookingWriterBusy=true;
 try{
  const port=process.env.PORT||'3000';
  const response=await fetch(`http://127.0.0.1:${port}/api/internal/canonical-booking-worker`,{
   method:'POST',headers:{'x-booking-writer-secret':secret},signal:AbortSignal.timeout(600_000),
  });
  if(!response.ok)console.error(`Canonical booking worker returned ${response.status}.`);
 }catch(error){console.error(`Canonical booking worker request failed (${error instanceof Error?error.name:'unknown'}).`)}
 finally{bookingWriterBusy=false}
}
if(process.env.CANONICAL_BOOKING_WRITER_ENABLED==='true'&&process.env.CANONICAL_BOOKING_WRITER_AUTOPOLL_ENABLED!=='false'){
 bookingWriterTimer=setInterval(pollCanonicalBookings,10_000);
 setTimeout(pollCanonicalBookings,10_000);
}
const registryEntities=['DRIVERS','VEHICLES','ACCOUNTS','ZONES','GENERIC_API'];
let registryTimer,registryStartTimer,registryBusy=false,registryIndex=0;
async function pollAutocabRegistry(){
 if(closing||registryBusy||process.env.AUTOCAB_REGISTRY_WRITER_ENABLED!=='true')return;
 const secret=process.env.BOOKING_WRITER_JOB_SECRET;
 if(!secret){console.error('Autocab registry job secret is missing.');return}
 registryBusy=true;
 const entity=registryEntities[registryIndex++%registryEntities.length];
 try{
  const port=process.env.PORT||'3000';
  const result=await fetch(`http://127.0.0.1:${port}/api/internal/autocab-registry-sync`,{
   method:'POST',headers:{'Content-Type':'application/json','x-booking-writer-secret':secret},
   body:JSON.stringify({entity}),signal:AbortSignal.timeout(10*60_000),
  });
  if(!result.ok)console.error(`Autocab ${entity} registry sync returned ${result.status}.`);
 }catch(error){console.error(`Autocab ${entity} registry request failed (${error instanceof Error?error.name:'unknown'}).`)}
 finally{registryBusy=false}
}
if(process.env.AUTOCAB_REGISTRY_WRITER_ENABLED==='true'){
 registryTimer=setInterval(pollAutocabRegistry,15*60_000);
 registryStartTimer=setTimeout(pollAutocabRegistry,60_000);
}
child.on('exit',(code,signal)=>{closing=true;clearTimeout(retryTimer);clearTimeout(reconciliationTimer);clearInterval(bookingWriterTimer);clearInterval(registryTimer);clearTimeout(registryStartTimer);audit?.kill();reconciliation?.kill();if(signal)process.kill(process.pid,signal);else process.exit(code??1)});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{closing=true;clearTimeout(retryTimer);clearTimeout(reconciliationTimer);clearInterval(bookingWriterTimer);clearInterval(registryTimer);clearTimeout(registryStartTimer);audit?.kill(signal);reconciliation?.kill(signal);child.kill(signal)});

// Shared WhatsApp jobs are opt-in and never enable Meta sending.
if(process.env.WHATSAPP_SHARED_ENABLED==='true'&&process.env.WHATSAPP_WORKER_SECRET?.length>=32){
 let whatsappBusy=false;
 const pollWhatsApp=async()=>{if(whatsappBusy)return;whatsappBusy=true;try{
 const result=await fetch(`http://127.0.0.1:${process.env.PORT||'3000'}/api/internal/whatsapp/v1/worker`,{method:'POST',headers:{'x-whatsapp-worker-secret':process.env.WHATSAPP_WORKER_SECRET},signal:AbortSignal.timeout(180000)});
 if(!result.ok)console.error('WHATSAPP_SHARED_JOB_UNAVAILABLE',result.status);
 }catch{console.error('WHATSAPP_SHARED_JOB_UNAVAILABLE');}finally{whatsappBusy=false;}};
 setInterval(pollWhatsApp,60000).unref();setTimeout(pollWhatsApp,15000).unref();
}

// This evaluates locally stored GPS webhooks, never polls Autocab or DfT.
// Off until explicitly configured; observe mode cannot send or reserve messages.
if(['observe','live','pilot'].includes(process.env.ROAD_CLOSURE_ALERTS_MODE)&&process.env.BOOKING_WRITER_JOB_SECRET){
 let roadAlertsBusy=false,lastRoadAlertReport=0;
 const pollRoadAlerts=async()=>{if(closing||roadAlertsBusy)return;roadAlertsBusy=true;try{
  const result=await fetch(`http://127.0.0.1:${process.env.PORT||'3000'}/api/internal/street-manager/driver-alerts`,{method:'POST',headers:{'x-booking-writer-secret':process.env.BOOKING_WRITER_JOB_SECRET},signal:AbortSignal.timeout(55000)});
  if(!result.ok)console.error('ROAD_CLOSURE_ALERT_WORKER_UNAVAILABLE',result.status);
  else{const data=await result.json();if(data.attempted>0||Date.now()-lastRoadAlertReport>=60000){console.info('ROAD_CLOSURE_ALERT_RUN '+JSON.stringify({mode:data.mode,pilot:data.pilot,suppressed:data.suppressed,activeClosures:data.activeClosures,activeRoadworks:data.activeRoadworks,activeRestrictions:data.activeRestrictions,activeEvents:data.activeEvents,trackedDrivers:data.trackedDrivers,candidates:data.candidates,attempted:data.attempted,accepted:data.accepted,rejected:data.rejected,unknown:data.unknown,reason:data.reason}));lastRoadAlertReport=Date.now()}}
 }catch{console.error('ROAD_CLOSURE_ALERT_WORKER_UNAVAILABLE')}finally{roadAlertsBusy=false}};
 setInterval(pollRoadAlerts,10000).unref();setTimeout(pollRoadAlerts,15000).unref();
}

// Supplementary public records only. This job never sends driver messages and
// does not change ROAD_CLOSURE_ALERTS_MODE. Successful council fetches are due 6-hourly.
if(process.env.STREET_MANAGER_COUNCIL_SYNC_ENABLED==='true'&&process.env.BOOKING_WRITER_JOB_SECRET){
 let supplementaryBusy=false;
 const syncSupplementary=async()=>{if(closing||supplementaryBusy)return;supplementaryBusy=true;try{
  const response=await fetch(`http://127.0.0.1:${process.env.PORT||'3000'}/api/internal/street-manager/supplementary-sync`,{method:'POST',headers:{'x-booking-writer-secret':process.env.BOOKING_WRITER_JOB_SECRET},signal:AbortSignal.timeout(90000)});
  const result=await response.json();console.info('STREET_MANAGER_SUPPLEMENTARY_SYNC '+JSON.stringify({httpStatus:response.status,enabled:result.enabled,archive:result.archive,council:result.council,error:result.error}));
 }catch{console.error('STREET_MANAGER_SUPPLEMENTARY_SYNC_UNAVAILABLE')}finally{supplementaryBusy=false}};
 setTimeout(syncSupplementary,20000).unref();setInterval(syncSupplementary,6*3600000).unref();
}
