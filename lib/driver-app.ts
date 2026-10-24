import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';
import {database} from './database';
export const driverTokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
const COOKIE='nac_driver_session';
export async function currentDriver(){const token=(await cookies()).get(COOKIE)?.value;if(!token)return null;return(await database().query(`SELECT a.id,a.email,a.online,a.latitude,a.longitude,a.accuracy,a.gps_at,d."fullName" name,d.callsign FROM driver_app_sessions s JOIN driver_app_accounts a ON a.id=s.account_id JOIN public."Driver" d ON d.id=a.driver_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.enabled AND a.password_hash IS NOT NULL AND d.active AND NOT d.suspended AND NOT d.archived`,[driverTokenHash(token)])).rows[0]??null}
export async function setDriverSession(id:string){const token=randomBytes(32).toString('base64url');await database().query("INSERT INTO driver_app_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[driverTokenHash(token),id]);(await cookies()).set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:604800})}
export async function clearDriverSession(){const jar=await cookies(),token=jar.get(COOKIE)?.value;if(token)await database().query('DELETE FROM driver_app_sessions WHERE token_hash=$1',[driverTokenHash(token)]);jar.set(COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0})}
export const trainingPickup={latitude:50.3778,longitude:-4.1436,label:'Plymouth Station'};
export const trainingDestination={latitude:50.4166,longitude:-4.1139,label:'Derriford Hospital'};
export const previewDriver={latitude:50.3697,longitude:-4.1423};
export const driverAppId=randomUUID;
