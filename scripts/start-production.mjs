import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import pg from 'pg';

const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
try{await pool.query(await readFile(new URL('../db/init.sql',import.meta.url),'utf8'))}
finally{await pool.end()}

const child=spawn(process.execPath,['server.js'],{stdio:'inherit',env:process.env});
child.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exit(code??1)});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
