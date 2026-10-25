import {requireAutocabForJob} from './integration-guard.mjs';
import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {apiKey,assertArchiveTarget,JOB,nextRequestAt,persistApiBackoff} from './autocab-history-import.mjs';
export const RESOURCES={drivers:'/driver/v1/drivers',vehicles:'/vehicle/v1/vehicles'};
const ORIGIN='https://autocab-api.azure-api.net';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const field=(row,...names)=>{for(const name of names){const key=Object.keys(row).find(k=>k.toLowerCase()===name.toLowerCase());if(key!==undefined)return row[key]}return undefined};
export const REGISTRY_SCHEMA=`
CREATE TABLE IF NOT EXISTS autocab_registry_progress (
 resource text PRIMARY KEY CHECK(resource IN ('drivers','vehicles')),
 status text NOT NULL DEFAULT 'PENDING', next_url text, pages integer NOT NULL DEFAULT 0,
 records_seen bigint NOT NULL DEFAULT 0, error_code text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS autocab_registry_responses (
 response_id uuid PRIMARY KEY,resource text NOT NULL,request_url text NOT NULL,
 raw_response jsonb NOT NULL,item_count integer,validation_error text,fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS autocab_registry_versions (
 resource text NOT NULL,autocab_id text NOT NULL,payload_sha256 text NOT NULL,raw_payload jsonb NOT NULL,
 first_seen_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(resource,autocab_id,payload_sha256)
);
CREATE TABLE IF NOT EXISTS autocab_drivers (
 autocab_id text PRIMARY KEY,company_id text,callsign text,status text,suspended boolean,
 raw_payload jsonb NOT NULL,payload_sha256 text NOT NULL,
 first_fetched_at timestamptz NOT NULL DEFAULT now(),last_fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS autocab_vehicles (
 autocab_id text PRIMARY KEY,company_id text,callsign text,status text,suspended boolean,registration text,
 raw_payload jsonb NOT NULL,payload_sha256 text NOT NULL,
 first_fetched_at timestamptz NOT NULL DEFAULT now(),last_fetched_at timestamptz NOT NULL DEFAULT now()
);`;
export function registryUrl(resource,next){
 if(!Object.hasOwn(RESOURCES,resource))throw new Error('Unknown registry resource');
 const url=new URL(next??RESOURCES[resource],ORIGIN);
 if(url.origin!==ORIGIN||url.pathname!==RESOURCES[resource]||url.username||url.password)throw new Error('Unsafe registry pagination URL');
 return url.href;
}
export function parseRegistryPage(resource,body,previousCount=0){
 if(!Object.hasOwn(RESOURCES,resource))throw new Error('Unknown registry resource');
 let items=Array.isArray(body)?body:null;
 if(!items&&object(body)){
  for(const key of [resource,resource==='drivers'?'driverList':'vehicleList','items','results','data']){
   if(Array.isArray(body[key])){items=body[key];break}
   if(object(body[key])&&Array.isArray(body[key].items)){items=body[key].items;break}
  }
 }
 if(!items)throw new Error('REGISTRY_ARRAY_MISSING');
 for(const item of items){
  if(!object(item))throw new Error('REGISTRY_RECORD_INVALID');
  const id=field(item,'id',resource==='drivers'?'driverId':'vehicleId');
  if(!/^\d+$/.test(String(id))||(typeof id==='number'&&!Number.isSafeInteger(id)))throw new Error('REGISTRY_ID_INVALID');
  if(String(field(item,'sourceSystem')??'').toLowerCase()==='taxicrm')throw new Error('REGISTRY_SOURCE_INVALID');
 }
 const root=object(body)?body:{};
 const link=root.nextLink??root.nextPageUrl??root.next;
 if(link!=null&&link!==''&&link!==false&&typeof link!=='string')throw new Error('REGISTRY_PAGINATION_REQUIRES_CONTRACT');
 const nextUrl=typeof link==='string'&&link?registryUrl(resource,link):null;
 if(!nextUrl&&(root.continuationToken||root.hasMore===true||(Number.isFinite(Number(root.totalCount))&&Number(root.totalCount)>previousCount+items.length)))throw new Error('REGISTRY_PAGINATION_REQUIRES_CONTRACT');
 return {items,nextUrl};
}
function text(row,...names){const v=field(row,...names);return v==null?null:String(v)}
export async function saveRegistryResponse(db,resource,url,body){
 registryUrl(resource,url);
 let parsed;
 try{
  const {rows:[progress]}=await db.query('SELECT records_seen FROM autocab_registry_progress WHERE resource=$1',[resource]);
  parsed=parseRegistryPage(resource,body,Number(progress?.records_seen??0));
  if(parsed.nextUrl===url)throw new Error('REGISTRY_PAGINATION_CYCLE');
  if(parsed.nextUrl&&(await db.query('SELECT 1 FROM autocab_registry_responses WHERE resource=$1 AND request_url=$2 AND validation_error IS NULL LIMIT 1',[resource,parsed.nextUrl])).rowCount)throw new Error('REGISTRY_PAGINATION_CYCLE');
 }catch(error){
  await db.query('INSERT INTO autocab_registry_responses(response_id,resource,request_url,raw_response,validation_error) VALUES($1,$2,$3,$4,$5)',[randomUUID(),resource,url,JSON.stringify(body),error.message]);
  await db.query("UPDATE autocab_registry_progress SET status='BLOCKED',error_code=$2,updated_at=now() WHERE resource=$1",[resource,error.message]);
  throw error;
 }
 const {items,nextUrl}=parsed;
 const responseId=randomUUID();
 await db.query('BEGIN');
 try{
  for(const item of items){
   const id=text(item,'id',resource==='drivers'?'driverId':'vehicleId'),raw=JSON.stringify(item),hash=createHash('sha256').update(raw).digest('hex');
   const suspended=field(item,'suspended','isSuspended');
   const columns=[id,text(item,'companyId')??(object(item.company)?text(item.company,'id'):null),text(item,'callsign','callSign'),text(item,'status'),typeof suspended==='boolean'?suspended:null,raw,hash];
   // Resource is validated against a closed allowlist above, never arbitrary SQL.
   if(resource==='drivers')await db.query(`INSERT INTO autocab_drivers(autocab_id,company_id,callsign,status,suspended,raw_payload,payload_sha256)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(autocab_id) DO UPDATE SET company_id=excluded.company_id,callsign=excluded.callsign,status=excluded.status,suspended=excluded.suspended,raw_payload=excluded.raw_payload,payload_sha256=excluded.payload_sha256,last_fetched_at=now()`,columns);
   else await db.query(`INSERT INTO autocab_vehicles(autocab_id,company_id,callsign,status,suspended,raw_payload,payload_sha256,registration)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(autocab_id) DO UPDATE SET company_id=excluded.company_id,callsign=excluded.callsign,status=excluded.status,suspended=excluded.suspended,raw_payload=excluded.raw_payload,payload_sha256=excluded.payload_sha256,registration=excluded.registration,last_fetched_at=now()`,[...columns,text(item,'registration','registrationNumber','regNumber')]);
   await db.query(`INSERT INTO autocab_registry_versions(resource,autocab_id,payload_sha256,raw_payload) VALUES($1,$2,$3,$4)
    ON CONFLICT(resource,autocab_id,payload_sha256) DO UPDATE SET last_seen_at=now()`,[resource,id,hash,raw]);
  }
  await db.query('INSERT INTO autocab_registry_responses(response_id,resource,request_url,raw_response,item_count) VALUES($1,$2,$3,$4,$5)',[responseId,resource,url,JSON.stringify(body),items.length]);
  await db.query('UPDATE autocab_registry_progress SET status=$2,next_url=$3,pages=pages+1,records_seen=records_seen+$4,error_code=NULL,updated_at=now() WHERE resource=$1',[resource,nextUrl?'PENDING':'COMPLETE',nextUrl,items.length]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error}
 return {resource,saved:items.length,complete:!nextUrl};
}
export async function runRegistry(env=process.env){
 if(!env.AUTOCAB_HISTORY_DATABASE_URL)throw new Error('Archive database is required');
 assertArchiveTarget(env.AUTOCAB_HISTORY_DATABASE_URL);
 const db=new pg.Client({connectionString:env.AUTOCAB_HISTORY_DATABASE_URL,connectionTimeoutMillis:10000});
 const deadline=Date.now()+110000;
 let requests=0;
 try{
  await db.connect();
  const {rows:[lock]}=await db.query("SELECT pg_try_advisory_lock(hashtext('autocab-history-import')) AS acquired");
  if(!lock.acquired){console.log('Registry deferred: booking import owns API lock; no API call made');return}
  await db.query(REGISTRY_SCHEMA);
  for(const resource of Object.keys(RESOURCES))await db.query('INSERT INTO autocab_registry_progress(resource) VALUES($1) ON CONFLICT DO NOTHING',[resource]);
  const key=await apiKey(env);
  for(const resource of Object.keys(RESOURCES)){
   while(requests<5&&Date.now()<deadline){
    const {rows:[progress]}=await db.query('SELECT * FROM autocab_registry_progress WHERE resource=$1',[resource]);
    if(progress.status==='COMPLETE'||progress.status==='BLOCKED')break;
    const {rows:[budget]}=await db.query('SELECT * FROM import_progress WHERE job=$1',[JOB]);
    if(!budget)throw new Error('Booking import rate state missing');
    const delay=Math.max(0,nextRequestAt(budget,10000)-Date.now())+Math.floor(Math.random()*1000);
    if(Date.now()+delay+30000>deadline){console.log('Registry deferred: shared API cooldown; no API call made');return}
    await new Promise(resolve=>setTimeout(resolve,delay));
    const url=registryUrl(resource,progress.next_url);
    await db.query('UPDATE import_progress SET requests=requests+1,last_request_at=now() WHERE job=$1',[JOB]);requests++;
    let response;
    await requireAutocabForJob(env);
    try{response=await fetch(url,{headers:{Accept:'application/json','Ocp-Apim-Subscription-Key':key},redirect:'error',signal:AbortSignal.timeout(30000)})}
    catch{await persistApiBackoff(db,503,null,1);console.log(JSON.stringify({event:'registry_network_retry',resource}));return}
    if(response.status===429||response.status>=500){await persistApiBackoff(db,response.status,response.headers.get('retry-after'),1);await response.body?.cancel();console.log(JSON.stringify({event:'registry_backoff',resource,status:response.status}));return}
    if(!response.ok){await response.body?.cancel();await db.query("UPDATE autocab_registry_progress SET status='BLOCKED',error_code=$2 WHERE resource=$1",[resource,`HTTP_${response.status}`]);console.log(JSON.stringify({event:'registry_blocked',resource,status:response.status}));return}
    const body=await response.json();
    console.log(JSON.stringify({event:'registry_saved',...await saveRegistryResponse(db,resource,url,body)}));
   }
  }
 }finally{await db.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runRegistry().catch(error=>{console.error(JSON.stringify({event:'registry_failed',code:/^REGISTRY_[A-Z_]+$/.test(error.message)?error.message:error.code??'INSPECT_REGISTRY_RESPONSE'}));process.exitCode=1});
