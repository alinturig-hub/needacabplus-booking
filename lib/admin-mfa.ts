import {createHash,createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import {database} from './database';
import {decryptCredentials,encryptCredentials} from './credentials';
import {loadSmsPolicy} from './app-configuration';
import {sendSmsMessage} from './sms-transport';
import {authLimit,normalizePhone} from './customer-verification';

const CHALLENGE_COOKIE='nac_admin_mfa';
const CHALLENGE_SECONDS=300;
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export type AdminSecurityRow={totp_secret_encrypted:string;sms_phone:string;pending_totp_encrypted:string;pending_sms_phone:string;pending_code_hash:string;pending_expires_at:Date|null;pending_attempts:number;session_version:number;last_totp_step:number};
export async function adminSecurity(){return (await database().query<AdminSecurityRow>('SELECT * FROM admin_security WHERE id=true')).rows[0]}
export function hasMfa(row:AdminSecurityRow){return Boolean(row.totp_secret_encrypted||row.sms_phone)}
export function hashToken(value:string){return createHash('sha256').update(value).digest('hex')}
function same(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function base32(bytes:Buffer){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-=5))&31]}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out}
function fromBase32(value:string){let bits=0,n=0;const bytes:number[]=[];for(const c of value.replace(/\s|=/g,'').toUpperCase()){const digit=alphabet.indexOf(c);if(digit<0)throw new Error('Invalid authenticator secret');n=(n<<5)|digit;bits+=5;if(bits>=8){bytes.push((n>>>(bits-=8))&255)}}return Buffer.from(bytes)}
export function newTotpSecret(){return base32(randomBytes(20))}
export function totp(secret:string,step=Math.floor(Date.now()/30000)){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const digest=createHmac('sha1',fromBase32(secret)).update(counter).digest();const offset=digest[19]&15;return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
export function matchingTotpStep(secret:string,code:string,lastStep=-1){if(!/^\d{6}$/.test(code))return null;const current=Math.floor(Date.now()/30000);for(const step of [current-1,current,current+1])if(step>lastStep&&same(totp(secret,step),code))return step;return null}
export function encryptTotp(secret:string){return encryptCredentials({secret})}
export function decryptTotp(encrypted:string){return decryptCredentials(encrypted).secret}
function otpHash(token:string,code:string){const secret=process.env.ADMIN_SESSION_SECRET;if(!secret)throw new Error('Admin session secret missing');return createHmac('sha256',secret).update(token+':'+code).digest('hex')}
export async function sendAdminCode(phone:string,code:string){const {settings,secrets}=await loadSmsPolicy();if(!settings.enabled||!settings.endpoint)throw new Error('Configure and enable the SMS gateway first.');await sendSmsMessage(settings,secrets,normalizePhone(phone),`Your Need A Cab Plus admin sign-in code is ${code}. It expires in 5 minutes.`)}
export async function beginLoginChallenge(staffId:string|null=null){const token=randomBytes(32).toString('base64url');await database().query('DELETE FROM admin_login_challenges WHERE expires_at<=now()');await database().query('INSERT INTO admin_login_challenges(token_hash,expires_at,staff_id) VALUES($1,now()+make_interval(secs=>$2),$3)',[hashToken(token),CHALLENGE_SECONDS,staffId]);(await cookies()).set(CHALLENGE_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:CHALLENGE_SECONDS});return token}
export async function loginChallenge(){const token=(await cookies()).get(CHALLENGE_COOKIE)?.value;if(!token)return null;const row=(await database().query<{token_hash:string;code_hash:string;code_expires_at:Date|null;attempts:number;staff_id:string|null}>('SELECT token_hash,code_hash,code_expires_at,attempts,staff_id FROM admin_login_challenges WHERE token_hash=$1 AND expires_at>now()',[hashToken(token)])).rows[0];return row?{token,row}:null}
export async function sendLoginSms(){const challenge=await loginChallenge();if(!challenge)throw new Error('Sign in again to request a code.');const security=await adminSecurity();if(!security.sms_phone)throw new Error('SMS sign-in is not enabled.');await authLimit('admin-login-sms:'+security.sms_phone,5,1800);const code=String(randomInt(0,1000000)).padStart(6,'0');await database().query('UPDATE admin_login_challenges SET code_hash=$2,code_expires_at=now()+make_interval(mins=>5) WHERE token_hash=$1',[challenge.row.token_hash,otpHash(challenge.token,code)]);try{await sendAdminCode(security.sms_phone,code)}catch(error){await database().query("UPDATE admin_login_challenges SET code_hash='',code_expires_at=NULL WHERE token_hash=$1",[challenge.row.token_hash]);throw error}}
export async function verifyLoginCode(method:'totp'|'sms',code:string){const challenge=await loginChallenge();if(!challenge||challenge.row.attempts>=5)return false;const security=await adminSecurity();await database().query('UPDATE admin_login_challenges SET attempts=attempts+1 WHERE token_hash=$1',[challenge.row.token_hash]);let valid=false;
 if(method==='totp'&&security.totp_secret_encrypted){const step=matchingTotpStep(decryptTotp(security.totp_secret_encrypted),code,Number(security.last_totp_step));if(step!==null){const result=await database().query('UPDATE admin_security SET last_totp_step=$1 WHERE id=true AND last_totp_step<$1',[step]);valid=Boolean(result.rowCount)}}
 if(method==='sms'&&security.sms_phone&&challenge.row.code_hash&&challenge.row.code_expires_at&&new Date(challenge.row.code_expires_at).getTime()>Date.now())valid=same(otpHash(challenge.token,code),challenge.row.code_hash);
 if(valid){const result=await database().query('DELETE FROM admin_login_challenges WHERE token_hash=$1',[challenge.row.token_hash]);valid=Boolean(result.rowCount);(await cookies()).delete(CHALLENGE_COOKIE)}return valid}
export function maskedPhone(phone:string){return phone?'•••• '+phone.slice(-4):''}
export function setupSmsCode(phone:string){const code=String(randomInt(0,1000000)).padStart(6,'0');return {code,hash:otpHash(phone,code)}}
export function checkSetupSmsCode(phone:string,code:string,hash:string){return /^\d{6}$/.test(code)&&same(otpHash(phone,code),hash)}
