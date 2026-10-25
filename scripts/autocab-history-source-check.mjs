import {requireAutocabForJob} from './integration-guard.mjs';
import pg from 'pg';import {createDecipheriv,createHash} from 'node:crypto';
const source=new pg.Client({connectionString:process.env.DATABASE_URL});const archive=new pg.Client({connectionString:process.env.AUTOCAB_HISTORY_DATABASE_URL});
try{
 await source.connect();await archive.connect();
 await source.query('BEGIN READ ONLY');
 const {rows}=await source.query("SELECT id,name,auth_type,api_key_header,credentials_encrypted FROM api_connections WHERE provider='autocab' AND base_url LIKE 'https://autocab-api.azure-api.net%' ORDER BY created_at DESC");await source.query('ROLLBACK');
 await archive.query('CREATE TABLE IF NOT EXISTS source_validation_probes(connection_id text PRIMARY KEY,connection_name text,http_status integer,response_payload jsonb,checked_at timestamptz DEFAULT now())');
 const groups=new Map();const secret=process.env.CREDENTIALS_ENCRYPTION_KEY||process.env.ADMIN_SESSION_SECRET;
 for(const row of rows){
  if(row.auth_type!=='api_key')continue;
  const [iv,tag,data]=row.credentials_encrypted.split('.');const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(iv,'base64url'));d.setAuthTag(Buffer.from(tag,'base64url'));const key=JSON.parse(Buffer.concat([d.update(Buffer.from(data,'base64url')),d.final()]).toString()).token;if(!key)continue;
  const hash=createHash('sha256').update(key).digest('hex');if(groups.has(hash)){console.log(JSON.stringify({connection:row.name,sameKeyAs:groups.get(hash)}));continue}groups.set(hash,row.name);
  if(groups.size>1)await new Promise(r=>setTimeout(r,11000));
  await requireAutocabForJob();const r=await fetch('https://autocab-api.azure-api.net/booking/v1/1.2/search',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','Ocp-Apim-Subscription-Key':key},body:JSON.stringify({from:'2018-01-01T00:00:00Z',to:'2022-10-01T23:59:59.999Z',telephoneNumber:'',companyIds:[],capabilities:[],capabilityMatchType:'Any',exactMatch:false,ignorePostcode:true,ignoreTown:true,types:['Active','ExchangedActive','Advanced','Mobile','ExchangedMobile','Cancelled','ExchangedCancelled','Completed','ExchangedCompleted','NoJob','ExchangedNoJob']})});
  if(!r.ok){await r.body?.cancel();console.log(JSON.stringify({connection:row.name,status:r.status}));await archive.query('INSERT INTO source_validation_probes(connection_id,connection_name,http_status) VALUES($1,$2,$3) ON CONFLICT(connection_id) DO NOTHING',[row.id,row.name,r.status]);if(r.status===429||r.status>=500)break;continue}
  const body=await r.json();await archive.query('INSERT INTO source_validation_probes(connection_id,connection_name,http_status,response_payload) VALUES($1,$2,$3,$4) ON CONFLICT(connection_id) DO UPDATE SET response_payload=excluded.response_payload,checked_at=now()',[row.id,row.name,r.status,JSON.stringify(body)]);
  const b=body.bookings||[];console.log(JSON.stringify({connection:row.name,id:row.id,status:r.status,count:b.length,minId:b.length?Math.min(...b.map(x=>x.id)):null,maxId:b.length?Math.max(...b.map(x=>x.id)):null,containsProvidedReference:b.some(x=>x.id===10017549),hasNext:!!body.continuationToken}));
 }
}finally{await source.end();await archive.end()}
