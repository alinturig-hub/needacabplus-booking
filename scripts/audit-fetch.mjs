import {setTimeout as delay} from 'node:timers/promises';
export async function fetchAuditBooking(url,headers,{fetcher=fetch,sleep=delay}={}){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetcher(url,{headers,signal:AbortSignal.timeout(5000)});
   if([401,403].includes(response.status))throw new Error(`STOP_HTTP_${response.status}`);
   if(response.status===429){
    if(attempt===2)throw new Error('STOP_HTTP_429');
    const value=response.headers.get('retry-after');
    const seconds=value===null?NaN:Number(value);
    const wait=Number.isFinite(seconds)?seconds*1000:Date.parse(value||'')-Date.now();
    await sleep(Math.min(60000,Math.max(1000,Number.isFinite(wait)?wait:10000)));continue;
   }
   if(response.status>=500&&attempt<2){await sleep(1000*(attempt+1));continue}
   if(!response.ok)throw new Error(`HTTP_${response.status}`);
   let remote;try{remote=await response.json()}catch{throw new Error('INVALID_JSON')}
   if(!remote||typeof remote!=='object'||Array.isArray(remote))throw new Error('INVALID_PAYLOAD');
   return remote;
  }catch(error){
   if(error.message.startsWith('STOP_')||/^HTTP_|^INVALID_/.test(error.message))throw error;
   if(attempt===2)throw new Error(error.name==='TimeoutError'||error.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR');
   await sleep(1000*(attempt+1));
  }
 }
 throw new Error('RETRIES_EXHAUSTED');
}
