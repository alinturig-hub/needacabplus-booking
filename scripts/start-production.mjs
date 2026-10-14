import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import pg from 'pg';

const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
function retentionDays(){const value=Number(process.env.DRIVER_POSITION_RETENTION_DAYS||90);return Number.isFinite(value)&&value>0?Math.floor(value):90}
const externalSchema=process.env.DATABASE_SCHEMA_MANAGED_EXTERNALLY==='true';
const retainPositions=process.env.DRIVER_POSITION_RETENTION_ENABLED==='true'||
 (!externalSchema&&process.env.DRIVER_POSITION_RETENTION_ENABLED!=='false');
try{
 if(!externalSchema){
  await pool.query(await readFile(new URL('../db/init.sql',import.meta.url),'utf8'));
 }
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
child.on('exit',(code,signal)=>{closing=true;clearTimeout(retryTimer);clearTimeout(reconciliationTimer);clearInterval(bookingWriterTimer);audit?.kill();reconciliation?.kill();if(signal)process.kill(process.pid,signal);else process.exit(code??1)});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{closing=true;clearTimeout(retryTimer);clearTimeout(reconciliationTimer);clearInterval(bookingWriterTimer);audit?.kill(signal);reconciliation?.kill(signal);child.kill(signal)});
