import {autocabTime,autocabIso} from '../lib/autocab-time.mjs';
export function timeEvidence(local,remote){
 const value=x=>typeof x==='string'?x.slice(0,100):null;
 const localTime=value(local.timeline_data?.scheduledAt);
 const apiTime=value(remote.pickupDueTime),apiUtc=value(remote.pickupDueTimeUtc);
 const explicit=x=>Boolean(x&&/(?:Z|[+-]\d\d:\d\d)$/i.test(x));
 const delta=(a,b)=>explicit(a)&&explicit(b)&&Number.isFinite(Date.parse(a))&&Number.isFinite(Date.parse(b))?(Date.parse(b)-Date.parse(a))/1000:null;
 return {localTime,apiTime,apiUtc,normalizedLocal:autocabIso(localTime),deltaSeconds:Number.isFinite(autocabTime(localTime))&&Number.isFinite(autocabTime(apiUtc||apiTime))?(autocabTime(apiUtc||apiTime)-autocabTime(localTime))/1000:null,utcDeltaSeconds:delta(localTime,apiUtc),localHasTimezone:explicit(localTime),apiHasTimezone:explicit(apiTime)};
}
