export const EBOOKER_HOST='eb.needacabplus.app';
export const EBOOKER_PUBLIC_ORIGIN=`https://${EBOOKER_HOST}`;
export const DEFAULT_EBOOKER_SLUG='needacabplus';

export function ebookerPublicLink(slug:string,origin=EBOOKER_PUBLIC_ORIGIN){return new URL('/ebooker/'+encodeURIComponent(slug),origin).href}
