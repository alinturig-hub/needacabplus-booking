export type HackneyPeriodSelection={period:string;from?:string;to?:string};
export function hackneyPeriodPredicate(period:{period:string;start:string|null;end:string|null;fromTime?:string;toTime?:string},add:(v:unknown)=>string):string;
export function hackneyBookingHref(group:string,selection:HackneyPeriodSelection):string;
