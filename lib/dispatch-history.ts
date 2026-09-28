import {createHash,createHmac} from 'node:crypto';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function operationKind(event:string){
 const key=event.toLowerCase().replace(/[^a-z]/g,'');
 const mapping:Record<string,string>={bookingcreated:'created',bookingdispatched:'offered',bookingdispatch:'offered',bookingdispatchoffered:'offered',bookingdispatchaccepted:'accepted',bookingaccepted:'accepted',bookingrejected:'rejected',bookingdispatchrejected:'rejected',bookingrecovered:'recovered',bookingarrived:'arrived',passengeronboard:'onboard',bookingcomplete:'completed',bookingcompleted:'completed',bookingcancelled:'cancelled',bookingrunninglate:'late',nofare:'no_fare'};
 return mapping[key]||null;
}
function stable(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable((value as Record<string,unknown>)[key])}`).join(',')}}`;
 return JSON.stringify(value)??'null';
}
export function receiptFingerprint(event:string,payload:unknown){return createHash('sha256').update(event.toLowerCase().replace(/[^a-z]/g,'')+':'+stable(payload)).digest('hex')}
export function sourceTimestamp(payload:unknown,eventType=''){
 const get=(r:Record<string,unknown>,name:string)=>Object.entries(r).find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1];
 const root=object(payload),data=object(get(root,'data')),detail=object(get(root,'booking')??get(root,'metadata')??get(data,'booking')??get(data,'metadata')??get(root,'data')??root);
 let value:unknown;
 for(const r of [root,detail]){value=get(r,'occurredAt')??get(r,'eventTimestamp')??get(r,'eventTime')??get(r,'timestamp');if(value)break}
 const fields:Record<string,string>={offered:'dispatchedAtTime',arrived:'vehicleArrivedAtTime',onboard:'pickedUpAtTime'};
 const timeField=fields[operationKind(eventType)||''];
 if(!value&&timeField){for(const r of [detail,root]){value=get(object(get(r,'dispatchedBooking')),timeField)??get(r,timeField);if(value)break}}
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))return null;
 return new Date(value).toISOString();
}
export function customerProfileKey(phone:unknown,secret:string|undefined){
 if(!secret||typeof phone!=='string')return null;
 let digits=phone.replace(/[^0-9]/g,'');if(digits.startsWith('00'))digits=digits.slice(2);if(digits.startsWith('0'))digits='44'+digits.slice(1);
 if(digits.length<9||digits.length>15||/^0+$/.test(digits))return null;
 return createHmac('sha256',secret).update(`contact:${digits}`).digest('hex');
}
export function receiptCallsigns(payload:unknown){const root=object(payload),data=object(root.data),detail=object(root.booking??root.metadata??data.booking??data.metadata??root.data??root);const text=(v:unknown)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,100):null;return {driver:text(detail.driverCallsign??object(detail.driver).callsign),vehicle:text(detail.vehicleCallsign??object(detail.vehicle).callsign)}}
