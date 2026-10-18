import pg from 'pg';
import {createDecipheriv,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const ENDPOINT='https://autocab-api.azure-api.net/booking/v1/1.2/search';
export const TYPES=['Active','Advanced','Mobile','Dispatched','Completed','Cancelled','Recovered','NoJob','Skipped','Suspended','ExchangedActive','ExchangedMobile','ExchangedCompleted','ExchangedCancelled','ExchangedNoJob'];
export const FROM='2022-09-29T23:00:00.000Z'; // 30 September, 00:00 Europe/London
export const TO='2026-10-18T21:00:00.000Z'; // 18 October, 22:00 Europe/London (inclusive)
export const ARCHIVE_DB='needacabplus_archive_20261018';
const WINDOW_MS=86400000;
export const JOB='autocab-history-20220930-20261018';
export const SCHEMA=`
CREATE TABLE IF NOT EXISTS import_progress (
 job text PRIMARY KEY, window_from timestamptz NOT NULL, window_to timestamptz NOT NULL,
 continuation_token text, pages bigint NOT NULL DEFAULT 0, records_seen bigint NOT NULL DEFAULT 0,
 requests bigint NOT NULL DEFAULT 0, last_request_at timestamptz, not_before timestamptz,
 done boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS autocab_bookings (
 autocab_id text PRIMARY KEY, company_id text, booking_type text, archive_reason text,
 pickup_due_utc timestamptz, booked_at_utc timestamptz,
 pricing jsonb, archived_booking jsonb, pickup jsonb, destination jsonb, vias jsonb,
 raw_payload jsonb NOT NULL, payload_sha256 text NOT NULL,
 first_fetched_at timestamptz NOT NULL DEFAULT now(), last_fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS autocab_archive_pickup_idx ON autocab_bookings(pickup_due_utc);
CREATE TABLE IF NOT EXISTS import_pages (
 job text NOT NULL, page_number bigint NOT NULL, window_from timestamptz NOT NULL, window_to timestamptz NOT NULL,
 request_token text, response_token text, record_count integer NOT NULL,
 fetched_at timestamptz NOT NULL DEFAULT now(), response_payload jsonb NOT NULL,
 PRIMARY KEY(job,page_number)
);`;
export function numberSetting(env,key,fallback,min,max){
 const n=Number(env[key]??fallback);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Invalid ${key}`);return n;
}
export function retryAfterMs(value,now=Date.now()){
 if(!value)return 0;
 const seconds=Number(value);if(Number.isFinite(seconds)&&seconds>=0)return Math.ceil(seconds*1000);
 const time=Date.parse(value);return Number.isFinite(time)?Math.max(0,time-now):0;
}
export function validatePage(body,previous){
 if(!body||!Array.isArray(body.bookings))throw new Error('Invalid Search response: bookings must be an array');
 const token=body.continuationToken===''?null:body.continuationToken??null;
 if(token!==null&&(typeof token!=='string'||!token.trim()))throw new Error('Invalid continuation token');
 if(token&&token===previous)throw new Error('Repeated continuation token; import paused');
 if(body.bookings.some(b=>!b||typeof b!=='object'||Array.isArray(b)||!/^\d+$/.test(String(b.id))))throw new Error('Invalid booking identifier; page not saved');
 return {bookings:body.bookings,token};
}
export function nextWindow(start){
 const from=new Date(start),to=new Date(Math.min(from.getTime()+WINDOW_MS-1,Date.parse(TO)));
 return {from:from.toISOString(),to:to.toISOString()};
}
export function timestamp(value){
 // Never guess a server-local timezone for offset-free provider values.
 if(value==null)return null;
 if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/i.test(value)||!Number.isFinite(Date.parse(value)))return null;
 return new Date(value).toISOString();
}
export function assertArchiveTarget(url){
 const parsed=new URL(url);
 if(decodeURIComponent(parsed.pathname.slice(1))!==ARCHIVE_DB)throw new Error(`Target database must be ${ARCHIVE_DB}; operational databases are forbidden`);
}
async function apiKey(env){
 if(env.AUTOCAB_HISTORY_API_KEY)return env.AUTOCAB_HISTORY_API_KEY;
 if(!env.DATABASE_URL)throw new Error('Configure AUTOCAB_HISTORY_API_KEY or the existing encrypted Autocab connection');
 if(!env.AUTOCAB_HISTORY_CONNECTION_ID)throw new Error('AUTOCAB_HISTORY_CONNECTION_ID is required: validate the source before import');
 const source=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:10000});
 try{
  await source.connect();await source.query('BEGIN READ ONLY');
  const {rows}=await source.query(`SELECT auth_type,api_key_header,credentials_encrypted FROM api_connections WHERE provider='autocab' AND base_url LIKE 'https://autocab-api.azure-api.net%' AND id=$1::uuid LIMIT 1`,[env.AUTOCAB_HISTORY_CONNECTION_ID]);
  await source.query('ROLLBACK');const r=rows[0];
  if(r?.auth_type!=='api_key'||r.api_key_header?.toLowerCase()!=='ocp-apim-subscription-key')throw new Error('A direct Autocab subscription-key connection is required');
  const secret=env.CREDENTIALS_ENCRYPTION_KEY||env.ADMIN_SESSION_SECRET;
  if(!secret||secret.length<32)throw new Error('Encrypted Autocab credential is unavailable');
  const [iv,tag,data]=r.credentials_encrypted.split('.');
  const cipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(iv,'base64url'));
  cipher.setAuthTag(Buffer.from(tag,'base64url'));
  const credentials=JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString());
  if(!credentials.token)throw new Error('Autocab subscription key is empty');return credentials.token;
 }finally{await source.end()}
}
export async function savePage(db,state,body){
 const {bookings,token}=validatePage(body,state.continuation_token);
 const window=nextWindow(state.window_from),page=Number(state.pages)+1;
 // A loop across several pages must also stop, even after a process restart.
 if(token){const seen=await db.query('SELECT 1 FROM import_pages WHERE job=$1 AND window_from=$2 AND response_token=$3 LIMIT 1',[JOB,window.from,token]);if(seen.rowCount)throw new Error('Continuation token cycle; import paused')}
 const done=!token&&Date.parse(window.to)>=Date.parse(TO);
 const following=token||done?window:nextWindow(new Date(Date.parse(window.to)+1));
 await db.query('BEGIN');
 try{
  for(const booking of bookings){
   const raw=JSON.stringify(booking);
   await db.query(`INSERT INTO autocab_bookings(autocab_id,company_id,booking_type,archive_reason,pickup_due_utc,booked_at_utc,pricing,archived_booking,pickup,destination,vias,raw_payload,payload_sha256)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT(autocab_id) DO UPDATE SET company_id=excluded.company_id,booking_type=excluded.booking_type,archive_reason=excluded.archive_reason,
    pickup_due_utc=excluded.pickup_due_utc,booked_at_utc=excluded.booked_at_utc,pricing=excluded.pricing,archived_booking=excluded.archived_booking,
    pickup=excluded.pickup,destination=excluded.destination,vias=excluded.vias,raw_payload=excluded.raw_payload,payload_sha256=excluded.payload_sha256,last_fetched_at=now()`,
    [String(booking.id),booking.companyId==null?null:String(booking.companyId),booking.bookingType??null,booking.archivedBooking?.reason??null,
     timestamp(booking.pickupDueTimeUtc??booking.pickupDueTime),timestamp(booking.bookedAtTime),JSON.stringify(booking.pricing??null),JSON.stringify(booking.archivedBooking??null),JSON.stringify(booking.pickup??null),JSON.stringify(booking.destination??null),JSON.stringify(booking.vias??null),raw,createHash('sha256').update(raw).digest('hex')]);
  }
  await db.query(`INSERT INTO import_pages(job,page_number,window_from,window_to,request_token,response_token,record_count,response_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[JOB,page,window.from,window.to,state.continuation_token,token,bookings.length,JSON.stringify(body)]);
  await db.query(`UPDATE import_progress SET window_from=$2,window_to=$3,continuation_token=$4,pages=pages+1,records_seen=records_seen+$5,done=$6,updated_at=now() WHERE job=$1`,[JOB,following.from,following.to,token,bookings.length,done]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error}
 return {page,records:bookings.length,done};
}
export async function run(env=process.env){
 if(!env.AUTOCAB_HISTORY_DATABASE_URL)throw new Error('AUTOCAB_HISTORY_DATABASE_URL is required');
 assertArchiveTarget(env.AUTOCAB_HISTORY_DATABASE_URL);
 const interval=numberSetting(env,'AUTOCAB_HISTORY_INTERVAL_MS',10000,10000,300000);
 const maxRequests=numberSetting(env,'AUTOCAB_HISTORY_MAX_REQUESTS',100,1,100);
 const maxMinutes=numberSetting(env,'AUTOCAB_HISTORY_MAX_MINUTES',25,1,120);
 const db=new pg.Client({connectionString:env.AUTOCAB_HISTORY_DATABASE_URL,connectionTimeoutMillis:10000});
 let stop=false,requests=0,failures=0;
 const deadline=Date.now()+maxMinutes*60000;
 const onStop=()=>{stop=true};process.on('SIGTERM',onStop);process.on('SIGINT',onStop);
 const pause=async ms=>{const until=Date.now()+ms;while(!stop&&Date.now()<until&&Date.now()<deadline)await new Promise(r=>setTimeout(r,Math.min(1000,until-Date.now())))};
 try{
  await db.connect();
  const lock=await db.query("SELECT pg_try_advisory_lock(hashtext('autocab-history-import')) AS acquired");
  if(!lock.rows[0].acquired){console.log('Import already running; no API call made');return}
  await db.query(SCHEMA);
  const first=nextWindow(FROM);
  await db.query('INSERT INTO import_progress(job,window_from,window_to) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[JOB,first.from,first.to]);
  if(env.AUTOCAB_HISTORY_STATUS_ONLY==='true'){
   const {rows}=await db.query('SELECT job,window_from,window_to,pages,records_seen,requests,last_request_at,not_before,done,updated_at,(SELECT count(*) FROM autocab_bookings) AS unique_bookings FROM import_progress WHERE job=$1',[JOB]);console.log(JSON.stringify(rows[0]));return;
  }
  const key=await apiKey(env);
  while(!stop&&requests<maxRequests&&Date.now()<deadline){
   const {rows:[state]}=await db.query('SELECT * FROM import_progress WHERE job=$1',[JOB]);
   if(state.done){console.log('Archive complete');break}
   // Wait for the requested historical cutoff; never mark a future window complete.
   if(Date.parse(nextWindow(state.window_from).to)>Date.now()){console.log('Waiting for final cutoff; resume later');break}
   const nextAllowed=Math.max(state.last_request_at?new Date(state.last_request_at).getTime()+interval:0,state.not_before?new Date(state.not_before).getTime():0);
   await pause(Math.max(0,nextAllowed-Date.now())+Math.floor(Math.random()*1000));
   if(stop||Date.now()>=deadline)break;
   await db.query('UPDATE import_progress SET requests=requests+1,last_request_at=now() WHERE job=$1',[JOB]);requests++;
   let response;
   try{
    const window=nextWindow(state.window_from);
    response=await fetch(ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','Accept':'application/json','Ocp-Apim-Subscription-Key':key},body:JSON.stringify({from:window.from,to:window.to,telephoneNumber:'',companyIds:[],capabilities:[],capabilityMatchType:'Any',exactMatch:false,ignorePostcode:true,ignoreTown:true,types:TYPES,...(state.continuation_token?{continuationToken:state.continuation_token}:{})})});
   }catch{
    failures++;await db.query("UPDATE import_progress SET not_before=now()+($2*interval '1 millisecond') WHERE job=$1",[JOB,Math.min(900000,30000*2**failures)]);
    console.log(JSON.stringify({event:'network_retry',failures}));if(failures>=5)throw new Error('Repeated network errors; import paused');continue;
   }
   if(response.status===429||response.status>=500){
    failures++;const delay=Math.max(retryAfterMs(response.headers.get('retry-after')),Math.min(900000,30000*2**failures));
    await db.query("UPDATE import_progress SET not_before=now()+($2*interval '1 millisecond') WHERE job=$1",[JOB,delay]);
    await response.body?.cancel();console.log(JSON.stringify({event:'api_backoff',status:response.status,delayMs:delay,failures}));
    if(failures>=5)throw new Error('Repeated Autocab errors; import paused');continue;
   }
   if(!response.ok){await response.body?.cancel();throw new Error(`Autocab HTTP ${response.status}; import paused`)}
   // Read the response within the same timeout before making another call.
   const body=await response.json();
   const result=await savePage(db,state,body);failures=0;
   await db.query('UPDATE import_progress SET not_before=NULL WHERE job=$1',[JOB]);
   console.log(JSON.stringify({event:'page_saved',...result,requestsThisRun:requests}));
  }
  console.log(JSON.stringify({event:'run_stopped',requestsThisRun:requests,resumable:true}));
 }finally{process.off('SIGTERM',onStop);process.off('SIGINT',onStop);await db.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){run().catch(error=>{console.error(JSON.stringify({event:'import_failed',error:typeof error.code==='string'?error.code:error.message?.startsWith('Autocab HTTP')?error.message:error.message?.includes('required')||error.message?.includes('must be')?error.message:'Import paused; inspect configuration or response schema. No checkpoint advanced.'}));process.exitCode=1})}
