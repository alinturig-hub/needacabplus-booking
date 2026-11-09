import {createHash,timingSafeEqual} from 'node:crypto';
// This capability grants read-only access to public roadworks fields, not admin access.
// Rotate this digest (or let it expire) to revoke the temporary preview link.
export const previewExpiresAt='2026-11-11T15:09:54.196812Z';
const digest='09b4af2cdab7823d3ed6bbfcee38b52c50e0d0ad7127cce5d7c192da94797669';
export function validStreetPreview(token:unknown,now=Date.now()):boolean{
 if(typeof token!=='string'||token.length!==43||now>=Date.parse(previewExpiresAt))return false;
 return timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(digest,'hex'));
}
