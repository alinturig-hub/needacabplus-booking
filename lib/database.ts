import {Pool} from 'pg';

const globalDatabase=globalThis as unknown as {needACabPool?:Pool;bookingAttemptPool?:Pool};

export function database(){
 const connectionString=process.env.DATABASE_URL;
 if(!connectionString)throw new Error('DATABASE_URL is not configured');
 globalDatabase.needACabPool??=new Pool({connectionString,max:10,ssl:connectionString.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
 return globalDatabase.needACabPool;
}

// Keep the quote claim in one database while application instances switch
// their main DATABASE_URL during a rolling migration.
export function bookingAttemptDatabase(){
 const connectionString=process.env.BOOKING_ATTEMPTS_DATABASE_URL;
 if(!connectionString)return database();
 globalDatabase.bookingAttemptPool??=new Pool({connectionString,max:5,ssl:connectionString.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
 return globalDatabase.bookingAttemptPool;
}
