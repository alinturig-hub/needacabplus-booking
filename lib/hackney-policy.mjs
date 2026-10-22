export const defaultHackneyPolicy={prefixes:['9','4'],flaggedSources:['FlaggedBooking']};
export function validateHackneyPolicy(value){
 if(!value||typeof value!=='object'||!Array.isArray(value.prefixes)||value.prefixes.length<1||value.prefixes.length>10||value.prefixes.some(x=>typeof x!=='string'||!/^\d{1,6}$/.test(x)))throw Error('Enter 1–10 numeric call sign prefixes (up to 6 digits each).');
 if(!Array.isArray(value.flaggedSources)||value.flaggedSources.length<1||value.flaggedSources.length>10||value.flaggedSources.some(x=>typeof x!=='string'||!x.trim()||x.length>80))throw Error('Enter 1–10 valid street booking source names.');
 return {prefixes:[...new Set(value.prefixes)],flaggedSources:[...new Set(value.flaggedSources.map(x=>x.trim()))]};
}
export function hackneyExpressions(policy,add,alias='booking'){
 if(!/^[a-z_]+$/.test(alias))throw Error('Invalid SQL alias');
 const p=validateHackneyPolicy(policy);
 const cmacMarker=column=>`COALESCE(${column},'') ~* '(^|[^[:alnum:]])cmac([^[:alnum:]]|$)'`;
 const cmac=`(lower(COALESCE(${alias}."paymentType",''))='account' AND (${cmacMarker(`${alias}."accountName"`)} OR ${cmacMarker(`${alias}."accountCode"`)} OR EXISTS(SELECT 1 FROM public."AutocabAccount" cmac_account WHERE cmac_account.provider=${alias}.provider AND cmac_account."externalId"=${alias}."accountId" AND (${cmacMarker('cmac_account."displayName"')} OR ${cmacMarker('cmac_account."accountCode"')}))))`;
 let hackney,street;
 return {cmac,get hackney(){return hackney??= `(COALESCE(btrim(${alias}."driverCallSign"),'') LIKE ANY(${add(p.prefixes.map(x=>x+'%'))}::text[]))`},get street(){return street??= `(COALESCE(${alias}."isStreetPickup",false) OR COALESCE(${alias}."bookingSource",'')=ANY(${add(p.flaggedSources)}::text[]))`},unknown:`(NULLIF(btrim(${alias}."driverCallSign"),'') IS NULL)`};
}
export function bookingGroupPredicate(group,expressions){
 const e=expressions;
 switch(group){case 'hackney':return e.hackney;case 'hackney-cmac':return `(${e.hackney} AND ${e.cmac})`;case 'street':return e.street;case 'hackney-street':return `(${e.hackney} AND ${e.street})`;case 'private-hire':return `(NOT ${e.hackney} AND NOT ${e.unknown})`;case 'unknown':return e.unknown;default:throw Error('Unknown booking group');}
}
