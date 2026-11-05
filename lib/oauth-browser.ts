import {createHash} from 'node:crypto';
/** Independent, host-only correlation cookie for each OAuth attempt. */
export function oauthBrowserCookie(provider:'google'|'apple',state:string){
 return `nac_oauth_${provider}_${createHash('sha256').update(state).digest('hex').slice(0,24)}`;
}
/** Cookie must be minted on the same configured host as the callback. */
export function oauthStartLocation(requestUrl:string,host:string|null,origin:string,provider:'google'|'apple'){
 const target=new URL(origin);const actual=host||new URL(requestUrl).host;
 return actual.toLowerCase()===target.host.toLowerCase()?null:new URL(`/api/customer/auth/oauth/${provider}`,target).toString();
}
