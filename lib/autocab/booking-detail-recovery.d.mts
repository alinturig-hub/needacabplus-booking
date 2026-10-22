export function sourceTimestamp(value:unknown):string|null;
export function providerTimestamp(value:unknown):string|null;
export function recoverBookingDetails(row:Record<string,unknown>,documents:{kind:string;id:string;payload:unknown}[],locations?:Record<string,unknown>[],vias?:Record<string,unknown>[]):{
 patch:Record<string,string>;sources:Record<string,unknown>;
 locations:({type:'PICKUP'|'DESTINATION';address:string}&Record<string,string>)[];
 vias:({position:number;address:string}&Record<string,string|number>)[];
};
