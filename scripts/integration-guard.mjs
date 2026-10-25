import pg from 'pg';
let pool;
export async function requireAutocabForJob(env=process.env){
 if(!env.DATABASE_URL)throw new Error('Integration control database is not configured. No Autocab call made.');
 pool??=new pg.Pool({connectionString:env.DATABASE_URL,max:1,allowExitOnIdle:true,connectionTimeoutMillis:10000});
 const result=await pool.query("SELECT enabled FROM public.integration_controls WHERE provider='autocab'");
 if(result.rows[0]?.enabled!==true)throw new Error('Autocab integration is disabled. Job paused.');
}
