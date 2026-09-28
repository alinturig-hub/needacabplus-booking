export function bookingPeriod(params:URLSearchParams,now=new Date()){
 const period=params.get('period')||'today';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const date=(s:string|null)=>{if(!s||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('Enter valid start and end dates.');return s};
 if(period==='all')return {period,start:null,end:null};
 if(period==='today')return {period,start:today,end:today};
 if(period==='7days'){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6);return {period,start:d.toISOString().slice(0,10),end:today}}
 if(period==='custom'){const start=date(params.get('from')),end=date(params.get('to'));const fromTime=params.get('fromTime')||'00:00',toTime=params.get('toTime')||'23:59';if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(fromTime)||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(toTime))throw Error('Enter valid hours and minutes.');if(start>end||(start===end&&fromTime>toTime))throw Error('The end must be on or after the start.');return {period,start,end,fromTime,toTime}}
 throw Error('Choose a valid booking period.');
}
export function bookingCsv(rows:Record<string,unknown>[]){const cols=['external_booking_id','name','phone','status','pickup','destination','source','payment_type','pickup_day'];const cell=(v:unknown)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};return [cols,...rows.map(r=>cols.map(k=>r[k]))].map(row=>row.map(cell).join(',')).join('\r\n')}
