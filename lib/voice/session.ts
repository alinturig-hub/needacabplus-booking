import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
export const VOICE_COOKIE='__Host-nac_voice_preview';
export type VoiceSession={principal:string;session:string;expires:number};
function sign(body:string){const key=process.env.ADMIN_SESSION_SECRET;if(!key||key.length<32)throw Error('VOICE_NOT_CONFIGURED');return createHmac('sha256',key).update('browser-voice:v1:'+body).digest('hex');}
export function issueVoiceSession(existing?:VoiceSession,now=Date.now()){const value={principal:existing?.principal||randomUUID(),session:randomUUID(),expires:now+3600000};const body=[value.principal,value.session,value.expires].join('.');return {value,cookie:body+'.'+sign(body)};}
export function readVoiceSession(cookie:string|undefined,now=Date.now()):VoiceSession|null{
 if(!cookie||cookie.length>250)return null;const parts=cookie.split('.');if(parts.length!==4)return null;
 const [principal,session,expiry,mac]=parts;if(![principal,session].every(v=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v))||!/^\d{13}$/.test(expiry)||!/^[a-f0-9]{64}$/.test(mac))return null;
 const expires=Number(expiry);if(expires<=now||expires>now+3600000)return null;
 return timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(sign(parts.slice(0,3).join('.')),'hex'))?{principal,session,expires}:null;
}
export const voiceCookie=(value:string)=>`${VOICE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`;
