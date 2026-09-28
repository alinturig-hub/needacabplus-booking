export function archivedBookingStatus(payload:unknown):string|null{
 if(!payload||typeof payload!=='object')return null;
 const archive=(payload as Record<string,unknown>).archivedBooking;
 if(!archive||typeof archive!=='object')return null;
 const reason=String((archive as Record<string,unknown>).reason||'').toLowerCase().replace(/[^a-z]/g,'');
 return ({completed:'Completed',cancelled:'Cancelled',canceled:'Cancelled',nofare:'No Fare'} as Record<string,string>)[reason]||null;
}
export function isUpcomingPickup(due:string|null,now:number){return Boolean(due&&Number.isFinite(Date.parse(due))&&Date.parse(due)>=now)}
