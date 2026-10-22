export const canonicalAssignmentFields:Record<'driver'|'vehicle',Record<string,string>>;
export function recoverAssignmentDetails(row:Record<string,unknown>,documents:{kind:string;id:string;payload:unknown}[],options?:{fillOnly?:boolean;onlyWhenAddsInformation?:boolean}):{details:Record<string,unknown>;patch:Record<string,string>;changed:boolean;matched:number};
