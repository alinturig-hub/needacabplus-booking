import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {database} from '../database';
import {hash} from './policy';
export const NOTIFICATION_SCOPE='alexa::devices:all:notifications:write';
export const alexaOrigins=['https://api.amazonalexa.com','https://api.eu.amazonalexa.com','https://api.fe.amazonalexa.com'];
function key(){const secret=process.env.ADMIN_SESSION_SECRET;if(!secret||secret.length<32)throw Error('ALEXA_NOTIFICATION_KEY');return createHash('sha256').update('alexa-notification-user:v1:'+secret).digest();}
export function encryptNotificationUser(user:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from('alexa-notification-user:v1'));const body=Buffer.concat([cipher.update(user,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64url')).join('.');}
export function decryptNotificationUser(value:string){const parts=value.split('.');if(parts.length!==3)throw Error('INVALID_NOTIFICATION_USER');const [iv,tag,body]=parts.map(p=>Buffer.from(p,'base64url'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from('alexa-notification-user:v1'));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8');}
export type ConsentEvent={userId:string;apiOrigin?:string;type:string;at:string;scopes:string[]};
export async function saveNotificationConsent(event:ConsentEvent,db=database()){
 // Only a publication subscription event enrolls a recipient. Permission-only
 // grants do not prove subscription to our MessageAlert publication.
 if(['AlexaSkillEvent.SkillPermissionAccepted','AlexaSkillEvent.SkillPermissionChanged'].includes(event.type)&&event.scopes.includes(NOTIFICATION_SCOPE))return;
 const enabled=event.type==='AlexaSkillEvent.ProactiveSubscriptionChanged'&&event.scopes.includes(NOTIFICATION_SCOPE);
 if(enabled&&!alexaOrigins.includes(event.apiOrigin||''))throw Error('INVALID_ALEXA_REGION');
 await db.query(`INSERT INTO alexa_notification_subscriptions(principal,user_cipher,api_origin,enabled,consent_at)
 VALUES($1,$2,$3,$4,$5) ON CONFLICT(principal) DO UPDATE SET user_cipher=EXCLUDED.user_cipher,api_origin=EXCLUDED.api_origin,enabled=EXCLUDED.enabled,consent_at=EXCLUDED.consent_at
 WHERE alexa_notification_subscriptions.consent_at<EXCLUDED.consent_at OR (alexa_notification_subscriptions.consent_at=EXCLUDED.consent_at AND EXCLUDED.enabled=false)`,[hash(event.userId),enabled?encryptNotificationUser(event.userId):null,enabled?event.apiOrigin:null,enabled,event.at]);
 if(!enabled)await db.query("UPDATE alexa_notification_outbox SET state='omitted',last_error='CONSENT_REVOKED' WHERE principal=$1 AND state='pending'",[hash(event.userId)]);
}
