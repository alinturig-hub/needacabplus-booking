import {createDecipheriv,createHash,randomUUID} from 'node:crypto';
const archiveProvider='autocab-archive-v1';
function credentialReader(secret){return value=>{const [iv,tag,data]=value.split('.'),key=createHash('sha256').update(secret).digest(),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8'))}}
export function connectionPlan(connections,endpoints,decode){
 const groups=[],updates=[],moves=[];
 for(const c of [...connections].sort((a,b)=>Number(new URL(b.base_url).pathname==='/')-Number(new URL(a.base_url).pathname==='/'))){
  const url=new URL(c.base_url),items=endpoints.filter(e=>e.connection_id===c.id);if(url.protocol!=='https:'||url.username||url.password||items.some(e=>!e.path.startsWith('/')||e.path.startsWith('//')))continue;
  const paths=items.map(e=>{const resolved=new URL(e.path,c.base_url.replace(/\/$/,'')+'/');if(resolved.origin!==url.origin)throw Error('Endpoint origin changed');return {...e,path:resolved.pathname+resolved.search}});
  let identity;try{const credentials=c.auth_type==='none'?{}:decode(c.credentials_encrypted);identity=JSON.stringify([url.origin,c.auth_type,c.auth_type==='api_key'?c.api_key_header.toLowerCase():'',Object.keys(credentials).sort().map(k=>[k,credentials[k]])])}catch{identity=c.id}
  const group=groups.find(g=>g.identity===identity&&paths.every(e=>!g.keys.has(e.action_key)));
  if(group){moves.push({from:c.id,to:group.id});paths.forEach(e=>group.keys.add(e.action_key));paths.forEach(e=>updates.push({...e,connection_id:group.id}))}
  else{groups.push({id:c.id,identity,keys:new Set(paths.map(e=>e.action_key)),origin:url.origin,name:c.name});paths.forEach(e=>updates.push(e))}
 }
 const changes=groups.map(g=>({id:g.id,base_url:g.origin,name:g.name}));
 for(const g of groups){if(new URL(g.origin).hostname==='autocab-api.azure-api.net'&&groups.filter(x=>x.origin===g.origin).length===1&&!groups.some(x=>x.id!==g.id&&x.name==='Autocab'))changes.find(c=>c.id===g.id).name='Autocab'}
 const changed=moves.length>0||changes.some(c=>{const old=connections.find(x=>x.id===c.id);return old.base_url!==c.base_url||old.name!==c.name})||updates.some(e=>endpoints.find(x=>x.id===e.id).path!==e.path);
 return {changed,connections:changes,endpoints:updates,moves};
}
export async function normalizeApiConnections(pool,secret=process.env.CREDENTIALS_ENCRYPTION_KEY||process.env.ADMIN_SESSION_SECRET){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");await db.query('SELECT pg_advisory_xact_lock(76820261104)');
  if((await db.query('SELECT id FROM api_connections WHERE provider=$1 LIMIT 1',[archiveProvider])).rows.length){await db.query('COMMIT');return {alreadyApplied:true}}
  await db.query('LOCK TABLE api_connections,api_endpoints IN SHARE ROW EXCLUSIVE MODE');
  const connections=(await db.query("SELECT * FROM api_connections WHERE provider='autocab' ORDER BY created_at,id")).rows;
  const endpoints=(await db.query("SELECT e.* FROM api_endpoints e JOIN api_connections c ON c.id=e.connection_id WHERE c.provider='autocab'")).rows;
  const plan=connectionPlan(connections,endpoints,credentialReader(secret||''));
  if(!plan.changed){await db.query('COMMIT');return {changed:false}}
  // Keep a complete, encrypted configuration snapshot outside the active provider.
  for(const c of connections){const id=randomUUID();await db.query('INSERT INTO api_connections(id,name,provider,base_url,auth_type,api_key_header,credentials_encrypted,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,JSON.stringify({id:c.id,name:c.name,canonicalId:plan.moves.find(move=>move.from===c.id)?.to||c.id}),archiveProvider,c.base_url,c.auth_type,c.api_key_header,c.credentials_encrypted,c.created_at]);
   for(const e of endpoints.filter(e=>e.connection_id===c.id))await db.query('INSERT INTO api_endpoints(id,connection_id,name,action_key,method,path,description,request_example,enabled,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,$9)',[randomUUID(),id,JSON.stringify({id:e.id,name:e.name,enabled:e.enabled}),e.action_key,e.method,e.path,e.description,JSON.stringify(e.request_example),e.created_at]);
  }
  for(const e of plan.endpoints)await db.query('UPDATE api_endpoints SET connection_id=$1,path=$2 WHERE id=$3',[e.connection_id,e.path,e.id]);
  for(const move of plan.moves){const remaining=await db.query('SELECT id FROM api_endpoints WHERE connection_id=$1',[move.from]);if(remaining.rows.length)throw Error('Connection still has endpoints');await db.query('DELETE FROM api_connections WHERE id=$1',[move.from])}
  for(const c of plan.connections)await db.query('UPDATE api_connections SET base_url=$1,name=$2,updated_at=now() WHERE id=$3',[c.base_url,c.name,c.id]);
  await db.query('COMMIT');return {changed:true,connectionsBefore:connections.length,connectionsAfter:connections.length-plan.moves.length,endpoints:endpoints.length};
 }catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
}

// Existing import jobs may still reference a connection ID consolidated above.
export const historyConnectionLookup=`SELECT c.auth_type,c.api_key_header,c.credentials_encrypted FROM api_connections c
 WHERE c.provider='autocab' AND c.base_url LIKE 'https://autocab-api.azure-api.net%'
 AND (c.id=$1::uuid OR c.id IN (SELECT CASE WHEN a.provider='autocab-archive-v1' THEN (a.name::jsonb->>'canonicalId')::uuid END
 FROM api_connections a WHERE CASE WHEN a.provider='autocab-archive-v1' THEN a.name::jsonb->>'id' END=$1::text))
 ORDER BY (c.id=$1::uuid) DESC LIMIT 1`;
