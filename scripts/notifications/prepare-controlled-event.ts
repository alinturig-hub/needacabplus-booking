/** Read-only canonical descriptor; never calls the gateway or changes runtime mode. */
import {writeFileSync} from 'node:fs';
import {prepareControlledEventReadOnly} from '../../lib/notifications/controlled/app';
import {database} from '../../lib/database';
async function main(){const output=process.argv[2];if(!output)throw Error('PRIVATE_OUTPUT_FILE_REQUIRED');try{const prepared=await prepareControlledEventReadOnly();writeFileSync(output,JSON.stringify(prepared,null,2)+'\n',{mode:0o600});console.log('Read-only controlled descriptor prepared; no event registration or provider call.')}finally{await Promise.all([database().end(),(globalThis as unknown as {taxiCrmPool?:import('pg').Pool}).taxiCrmPool?.end(),(globalThis as unknown as {bookingAttemptPool?:import('pg').Pool}).bookingAttemptPool?.end()])}}
void main().catch(error=>{const fileCode=(error as NodeJS.ErrnoException)?.code;const code=['EACCES','ENOENT','ENOSPC'].includes(fileCode||'')?fileCode:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'PREPARATION_UNAVAILABLE';console.error('Preparation blocked ('+code+'); no automatic refresh or send.');process.exitCode=1});
