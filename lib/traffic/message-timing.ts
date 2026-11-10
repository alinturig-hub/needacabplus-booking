export type AlertTiming={from?:string|null;to?:string|null;hours?:string|null;weekdaysOnly?:boolean;overnight?:boolean;startPlanned?:boolean;expectedEnd?:boolean};
type Parts={date:string;day:string;month:string;year:string;clock:string|null;instant:number};
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
const format=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function parts(value:string|null|undefined):Parts|null{
 if(!value)return null;
 if(/^\d{4}-\d\d-\d\d$/.test(value)){
  const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return null;
  const p=Object.fromEntries(format.formatToParts(date).map(x=>[x.type,x.value]));return {date:value,day:p.day,month:p.month,year:p.year,clock:null,instant:date.getTime()};
 }
 if(!/(?:Z|[+-]\d\d:\d\d)$/i.test(value))return null;
 const calendar=value.match(/^(\d{4}-\d\d-\d\d)T/)?.[1];if(!calendar||!parts(calendar))return null;
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
 const p=Object.fromEntries(format.formatToParts(date).map(x=>[x.type,x.value]));
 return {date:dayFormat.format(date),day:p.day,month:p.month,year:p.year,clock:p.hour+':'+p.minute,instant:date.getTime()};
}
const date=(p:Parts)=>`${p.day} ${p.month} ${p.year}`;
function range(a:Parts,b:Parts){if(a.date===b.date)return date(a);if(a.year===b.year&&a.month===b.month)return `${a.day}-${b.day} ${a.month} ${a.year}`;if(a.year===b.year)return `${a.day} ${a.month}-${b.day} ${b.month} ${a.year}`;return date(a)+'-'+date(b);}
export function formatTrafficTiming(timing?:AlertTiming):string{
 if(!timing)return '';
 const a=parts(timing.from),b=parts(timing.to),clock=(p:Parts)=>date(p)+(p.clock?' '+p.clock:'');
 if(a&&b&&(a.date>b.date||a.clock&&b.clock&&b.instant<=a.instant))return '';
 const hours=timing.hours&&!/[\r\n]/.test(timing.hours)&&/^(?:24h|(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d)$/.test(timing.hours)?timing.hours:null;
 if(hours){const period=a&&b?range(a,b):a?'From '+date(a):b?'Until '+date(b):'';return [period,hours+(timing.overnight?' overnight':'')+(timing.weekdaysOnly?' Mon-Fri':'')+' UK'].filter(Boolean).join('; ');}
 if(a&&b&&!a.clock&&!b.clock)return (timing.startPlanned?'Planned ':'')+range(a,b)+(timing.expectedEnd&&!timing.startPlanned?' (end planned)':'');
 if(a&&b&&a.clock&&b.clock&&a.date===b.date)return (timing.startPlanned?'Planned ':'')+`${date(a)} ${a.clock}-${b.clock} UK`+(timing.expectedEnd&&!timing.startPlanned?' (est. end)':'');
 const start=a?(timing.startPlanned?'Planned from ':'From ')+clock(a):'',end=b?(timing.expectedEnd?'Est. end ':'Until ')+clock(b):'';
 return [start,end].filter(Boolean).join('; ')+(a?.clock||b?.clock?' UK':'');
}
export function composeTrafficMessage(prefix:string,location:string,suffix:string,timing?:AlertTiming):string{
 const schedule=formatTrafficTiming(timing),tail=suffix+(schedule?' '+schedule:'');
 // Leave 15 characters for the existing [TRAFFIC TEST] prefix. Preserve the
 // event, source and complete known timing; shorten only the location label.
 const room=Math.max(1,185-prefix.length-tail.length),label=location.length>room?location.slice(0,Math.max(0,room-1))+'…':location;
 return prefix+label+tail;
}
