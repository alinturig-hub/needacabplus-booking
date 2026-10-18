export function normalizeKeys(value:unknown):unknown;
export function webhookDocument(payload:Record<string,unknown>,externalId:string):Record<string,unknown>;
export function mergeDocument(previous:unknown,patch:Record<string,unknown>,fillOnly?:boolean):Record<string,unknown>;
export function documentTimestamp(value:unknown):string|null;
