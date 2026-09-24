import {Pool} from 'pg';

const globalDatabase=globalThis as unknown as {needACabPool?:Pool};

export function database(){
 const connectionString=process.env.DATABASE_URL;
 if(!connectionString)throw new Error('DATABASE_URL is not configured');
 globalDatabase.needACabPool??=new Pool({connectionString,max:10,ssl:connectionString.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
 return globalDatabase.needACabPool;
}
