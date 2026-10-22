// Canonical pickupDueTime is stored as a UTC timestamp without time zone.
// Convert local boundaries to UTC, leaving the indexed column unwrapped.
export function hackneyPeriodPredicate(period,add){
 if(period.period==='all')return 'true';
 const start=add(`${period.start}T${period.fromTime||'00:00'}`);
 const end=add(`${period.end}T${period.toTime||'23:59'}`);
 return `(booking."pickupDueTime">=((${start}::timestamp AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC') AND booking."pickupDueTime"<(((${end}::timestamp + interval '1 minute') AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC'))`;
}
export function hackneyBookingHref(group,selection){
 const params=new URLSearchParams({group,period:selection.period});
 if(selection.period==='custom'){params.set('from',selection.from);params.set('to',selection.to)}
 return '/admin/bookings?'+params;
}
