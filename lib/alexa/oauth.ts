import {createHash,randomUUID} from 'node:crypto';
import {database} from '../database';
import {alexaConfig,hash,opaque} from './policy';
export async function issueAuthorizationCode(customerId:string,redirect:string,challenge:string){
 const code=opaque(),clientId=alexaConfig().clientId;await database().query('INSERT INTO alexa_authorization_codes(code_hash,customer_id,redirect_uri,code_challenge,client_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval \'2 minutes\')',[hash(code),customerId,redirect,challenge,clientId]);return code;
}
export async function exchangeToken(form:URLSearchParams){
 const config=alexaConfig(),access=opaque(),refresh=opaque(),db=database();let grant;
 if(form.get('grant_type')==='authorization_code'){
  const code=form.get('code'),redirect=form.get('redirect_uri');if(!code||!redirect||!config.redirects.includes(redirect))throw Error('INVALID_GRANT');
  const client=await db.connect();
  try{await client.query('BEGIN');const rows=await client.query('DELETE FROM alexa_authorization_codes WHERE code_hash=$1 AND redirect_uri=$2 AND client_id=$3 AND expires_at>now() RETURNING customer_id,code_challenge',[hash(code),redirect,config.clientId]);if(!rows.rows[0])throw Error('INVALID_GRANT');
   const verifier=form.get('code_verifier');if(!verifier||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||createHash('sha256').update(verifier).digest('base64url')!==rows.rows[0].code_challenge)throw Error('INVALID_GRANT');
   grant=(await client.query(`INSERT INTO alexa_grants(id,customer_id,access_hash,access_expires_at,refresh_hash,refresh_expires_at,client_id) VALUES($1,$2,$3,now()+interval '1 hour',$4,now()+interval '30 days',$5) RETURNING id`,[randomUUID(),rows.rows[0].customer_id,hash(access),hash(refresh),config.clientId])).rows[0];await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 }else if(form.get('grant_type')==='refresh_token'){
  const token=form.get('refresh_token');if(!token)throw Error('INVALID_GRANT');
  grant=(await db.query(`UPDATE alexa_grants SET access_hash=$1,access_expires_at=now()+interval '1 hour',refresh_hash=$2,refresh_expires_at=now()+interval '30 days' WHERE refresh_hash=$3 AND client_id=$4 AND revoked_at IS NULL AND refresh_expires_at>now() RETURNING id`,[hash(access),hash(refresh),hash(token),config.clientId])).rows[0];
 }else throw Error('UNSUPPORTED_GRANT_TYPE');
 if(!grant)throw Error('INVALID_GRANT');return {access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:'bookings:voice'};
}
export type AlexaCustomer={grantId:string;id:string;fullName:string;phone:string;email:string};
export async function alexaCustomer(request:Request):Promise<AlexaCustomer|null>{
 const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!token)return null;
 const row=(await database().query(`SELECT g.id AS grant_id,c.id,c.full_name,c.phone,c.email FROM alexa_grants g JOIN customer_accounts c ON c.id=g.customer_id WHERE g.access_hash=$1 AND g.client_id=$2 AND g.revoked_at IS NULL AND g.access_expires_at>now()`,[hash(token),alexaConfig().clientId])).rows[0];
 return row?{grantId:row.grant_id,id:row.id,fullName:row.full_name,phone:row.phone,email:row.email}:null;
}
