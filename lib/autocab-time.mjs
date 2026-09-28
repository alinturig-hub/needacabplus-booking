const london=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
// Operator webhook wall times are Europe/London. Explicit offsets stay authoritative.
// Ambiguous autumn times and nonexistent spring times require an explicit offset.
export function autocabTime(value){
 if(typeof value!=='string')return NaN;
 if(/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/i.test(value))return Date.parse(value);
 const match=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,7}))?$/.exec(value);
 if(!match)return NaN;
 const [,year,month,day,hour,minute,second,fraction='']=match;
 const wall=Date.UTC(+year,+month-1,+day,+hour,+minute,+second,+fraction.padEnd(3,'0').slice(0,3));
 const candidates=[wall,wall-3600000].filter(time=>{
  const parts=Object.fromEntries(london.formatToParts(time).map(p=>[p.type,p.value]));
  return parts.year===year&&parts.month===month&&parts.day===day&&parts.hour===hour&&parts.minute===minute&&parts.second===second;
 });
 return candidates.length===1?candidates[0]:NaN;
}
export function autocabIso(value){const time=autocabTime(value);return Number.isFinite(time)?new Date(time).toISOString():null}
