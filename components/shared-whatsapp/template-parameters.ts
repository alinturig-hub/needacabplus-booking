import { WhatsAppError } from "./template-error";
export type ParameterFormat="POSITIONAL"|"NAMED";
export function parameterKeys(text:string,format:ParameterFormat){
 const pattern=format==="NAMED"?/\{\{([a-z_]+)\}\}/g:/\{\{([1-9]\d*)\}\}/g;
 const keys=Array.from(new Set(Array.from(text.matchAll(pattern),m=>m[1])));
 if(/[{}]/.test(text.replace(pattern,"")))throw new WhatsAppError("INVALID_VARIABLES");
 if(format==="POSITIONAL"){keys.sort((a,b)=>Number(a)-Number(b));if(keys.some((k,i)=>Number(k)!==i+1))throw new WhatsAppError("VARIABLES_MUST_BE_SEQUENTIAL");}
 if(keys.length>10)throw new WhatsAppError("TOO_MANY_VARIABLES");
 return keys;
}
export function parameterExample(text:string,samples:unknown,format:ParameterFormat,section:"body"|"header"){
 const keys=parameterKeys(text,format);
 if(section==="header"&&keys.length>1)throw new WhatsAppError("INVALID_HEADER_VARIABLES");
 if(!Array.isArray(samples)||samples.length!==keys.length||samples.some(x=>typeof x!=="string"||!x.trim()||x.length>200||/[\x00-\x1f]/.test(x)))throw new WhatsAppError("VARIABLE_SAMPLES_REQUIRED");
 const values=samples as string[];
 const example=keys.length?(format==="NAMED"?{[`${section}_text_named_params`]:keys.map((param_name,i)=>({param_name,example:values[i]}))}:section==="body"?{body_text:[values]}:{header_text:values}):undefined;
 return {example,rendered:text.replace(/\{\{([^{}]+)\}\}/g,(_,key)=>values[keys.indexOf(key)]||"")};
}
