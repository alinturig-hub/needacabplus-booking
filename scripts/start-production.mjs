import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import pg from 'pg';

const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
function retentionDays(){const value=Number(process.env.DRIVER_POSITION_RETENTION_DAYS||90);return Number.isFinite(value)&&value>0?Math.floor(value):90}
try{
 await pool.query(await readFile(new URL('../db/init.sql',import.meta.url),'utf8'));
 await pool.query('DELETE FROM driver_positions WHERE COALESCE(recorded_at,received_at)<now()-make_interval(days=>$1)',[retentionDays()]);
}
finally{await pool.end()}

const child=spawn(process.execPath,['server.js'],{stdio:'inherit',env:process.env});
child.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exit(code??1)});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
