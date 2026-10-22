export type HackneyPolicy={prefixes:string[];flaggedSources:string[]};
export const defaultHackneyPolicy:HackneyPolicy;
export function validateHackneyPolicy(value:unknown):HackneyPolicy;
export function hackneyExpressions(policy:HackneyPolicy,add:(value:unknown)=>string,alias?:string):{hackney:string;street:string;unknown:string};
export function bookingGroupPredicate(group:string,expressions:{hackney:string;street:string;unknown:string}):string;
