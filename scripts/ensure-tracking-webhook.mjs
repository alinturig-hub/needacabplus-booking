import {createCipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';

const token=process.env.TRACKING_WEBHOOK_TOKEN;
const secret=process.env.CREDENTIALS_ENCRYPTION_KEY||process.env.ADMIN_SESSION_SECRET;
if(!token||token.length<32)throw new Error('TRACKING_WEBHOOK_TOKEN must contain at least 32 characters');
if(!secret||secret.length<32)throw new Error('Credential encryption key is missing');

const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);
const encrypted=Buffer.concat([cipher.update(JSON.stringify({token}),'utf8'),cipher.final()]);
const credential=[iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const provider=(await client.query(`INSERT INTO webhook_providers(id,name,description,base_url,api_key_header,api_key_encrypted,enabled)
  VALUES($1,'Autocab live tracking','Direct vehicle positions from Autocab','https://webhook.needacabplus.app','x-api-key',$2,true)
  ON CONFLICT(name) DO UPDATE SET api_key_encrypted=EXCLUDED.api_key_encrypted,enabled=true,updated_at=now()
  RETURNING id`,[randomUUID(),credential])).rows[0];
 const existing=await client.query('SELECT provider_id FROM provider_webhooks WHERE event_url_suffix=$1',['/vehicle-tracks-changed']);
 if(existing.rows.length&&existing.rows[0].provider_id!==provider.id)throw new Error('Tracking webhook URL is already assigned to another provider');
 await client.query(`INSERT INTO provider_webhooks(id,provider_id,name,description,event_type,event_url_suffix,event_filter_recipe,enabled)
  VALUES($1,$2,'Vehicle Tracks Changed','Live driver and vehicle tracking','Vehicle Tracks Changed','/vehicle-tracks-changed','',true)
  ON CONFLICT(provider_id,event_type,event_url_suffix) DO UPDATE SET enabled=true,updated_at=now()`,[randomUUID(),provider.id]);
 await client.query('COMMIT');
 console.log('Tracking webhook configured at https://webhook.needacabplus.app/vehicle-tracks-changed');
}catch(error){await client.query('ROLLBACK');throw error}
finally{client.release();await pool.end()}
