import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const opaque=()=>randomBytes(32).toString('base64url');
export function equalSecret(a:string|undefined,b:string|undefined){return Boolean(a&&b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b)));}
export function alexaConfig(env:Record<string,string|undefined>=process.env){
 const clientId=env.ALEXA_OAUTH_CLIENT_ID?.trim(),secret=env.ALEXA_OAUTH_CLIENT_SECRET;
 const redirects=(env.ALEXA_OAUTH_REDIRECT_URIS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(env.ALEXA_SKILL_ENABLED!=='true'||!clientId||!secret||secret.length<32||!redirects.length)throw Error('ALEXA_NOT_CONFIGURED');
 for(const value of redirects){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||!['pitangui.amazon.com','layla.amazon.com','alexa.amazon.co.jp'].includes(u.hostname))throw Error('ALEXA_REDIRECT_CONFIGURATION');}
 return {clientId,secret,redirects,mode:env.ALEXA_BOOKING_MODE==='live'?'live' as const:'preview' as const};
}
export function authorizationInput(params:URLSearchParams,env:Record<string,string|undefined>=process.env){
 const config=alexaConfig(env),client=params.get('client_id'),redirect=params.get('redirect_uri'),state=params.get('state'),scope=params.get('scope');
 if(params.get('response_type')!=='code'||client!==config.clientId||!redirect||!config.redirects.includes(redirect)||!state||state.length>2048||scope!=='bookings:voice')throw Error('INVALID_AUTHORIZATION_REQUEST');
 const codeChallenge=params.get('code_challenge');if(params.get('code_challenge_method')!=='S256'||!codeChallenge||!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge))throw Error('PKCE_REQUIRED');
 return {clientId:client,redirect,state,scope,codeChallenge};
}
export function normalizePlace(value:string){return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export type SavedPlace={id:string;kind:string;name:string;address:string;full_address:Record<string,unknown>};
export function savedPlace(places:SavedPlace[],spoken:string){
 const name=normalizePlace(spoken),matches=places.filter(p=>[p.name,p.kind==='favorite'?'':p.kind].some(label=>label&&normalizePlace(label)===name));
 if(matches.length!==1)throw Error(matches.length?'AMBIGUOUS_PLACE':'PLACE_NOT_SAVED');return matches[0];
}
export function fareSpeech(pickup:string,destination:string,pence:number,mode:'live'|'preview'){
 if(!Number.isSafeInteger(pence)||pence<=0)throw Error('INVALID_FARE');
 const clean=(s:string)=>s.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,250);
 const price=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
 return `${mode==='preview'?'This is a test. No taxi will be sent. ':''}From ${clean(pickup)} to ${clean(destination)}. For one passenger with no luggage, in a saloon. The fare is ${price}, paid in cash to the driver. ${mode==='preview'?'Shall I simulate this booking?':'Shall I book this taxi?'}`;
}
