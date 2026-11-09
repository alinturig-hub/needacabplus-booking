// Verified against signed production events on 2026-11-09. The authority owns
// the works location; a town/address substring is not a jurisdiction boundary.
export const PLYMOUTH_SWA_CODE='1160';
export const streetManagerScope={authority:'Plymouth City Council',swaCode:PLYMOUTH_SWA_CODE} as const;
export function isPlymouthEvent(data:Record<string,unknown>):boolean{
 const code=data.highway_authority_swa_code;
 return (typeof code==='string'||typeof code==='number')&&String(code).trim()===PLYMOUTH_SWA_CODE;
}
