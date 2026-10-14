import pg from 'pg';

const url=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
if(!url||!expectedHost||new URL(url).hostname!==expectedHost){
 throw new Error('RESTORE_URL must point to the expected migration database');
}
const db=new pg.Client({connectionString:url});
try{
 await db.connect();
 const roles=(await db.query(`SELECT rolname,rolcanlogin,rolsuper,rolreplication
  FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname`)).rows;
 const owners=(await db.query(`SELECT pg_get_userbyid(c.relowner) AS owner,
  COUNT(*)::int AS tables,ARRAY_AGG(c.relname ORDER BY c.relname)
   FILTER(WHERE c.relname IN ('Booking','WebhookEvent','bookings','driver_positions')) AS examples
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  GROUP BY c.relowner ORDER BY owner`)).rows;
 const grants=(await db.query(`SELECT grantee,privilege_type,COUNT(*)::int AS tables
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name IN ('Booking','WebhookEvent','bookings','driver_positions')
  GROUP BY grantee,privilege_type ORDER BY grantee,privilege_type`)).rows;
 console.log(JSON.stringify({roles,owners,grants}));
}catch(error){
 console.error('Role inspection failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await db.end().catch(()=>undefined)}
