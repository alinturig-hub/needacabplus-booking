export function stationSearchQuery(query:string):string|null {
 if(!/\b(?:trains?|railway|rail)\s+station\b/i.test(query))return null;
 return query.replace(/\b(?:trains?|railway|rail)\s+station\b/ig,'train station');
}
export function knownPlaceAddress(value:Record<string,unknown>|null|undefined){
 if(!value||value.source!=='WellKnown'||value.isCustom!==true||!value.id)return false;
 const c=value.coordinate as {latitude?:unknown;longitude?:unknown}|undefined;
 return typeof c?.latitude==='number'&&Number.isFinite(c.latitude)&&Math.abs(c.latitude)<=90&&typeof c.longitude==='number'&&Number.isFinite(c.longitude)&&Math.abs(c.longitude)<=180;
}
