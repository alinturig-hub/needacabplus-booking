import pg from 'pg';

const target=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
if(!target||!expectedHost||new URL(target).hostname!==expectedHost){
 throw new Error('RESTORE_URL must point to the expected migration database');
}

const checks=[
 ['needacabplus_shared_app',process.env.MIGRATION_NAC_PASSWORD,[
  ['Booking','SELECT',true],['Booking','INSERT',false],
  ['WebhookEvent','SELECT',true],['driver_positions','INSERT',true],
 ]],
 ['needacabplus_shared_reader',process.env.MIGRATION_NAC_READER_PASSWORD,[
  ['Booking','SELECT',true],['Booking','INSERT',false],
  ['driver_positions','SELECT',false],
 ]],
 ['taxicrm_shared_app',process.env.MIGRATION_TAXICRM_PASSWORD,[
  ['Booking','SELECT',true],['Booking','INSERT',true],
  ['driver_positions','SELECT',true],['driver_positions','INSERT',false],
 ]],
];
if(checks.some(([,password])=>!password))throw new Error('Migration role passwords are required');

let failed=false;
for(const [role,password,privileges] of checks){
 const url=new URL(target);
 url.username=role;
 url.password=password;
 const db=new pg.Client({connectionString:url.toString()});
 try{
  await db.connect();
  const current=(await db.query('SELECT current_user AS role')).rows[0].role;
  if(current!==role)throw new Error('Connected with unexpected role');
  const results=[];
  for(const [table,privilege,expected] of privileges){
   const actual=(await db.query('SELECT has_table_privilege(current_user,$1,$2) AS allowed',
    [`public."${table}"`,privilege])).rows[0].allowed;
   results.push({table,privilege,expected,actual});
   if(actual!==expected)failed=true;
  }
  await db.query('SELECT 1 FROM public."Booking" LIMIT 1');
  console.log(JSON.stringify({role,connected:true,results}));
 }catch(error){
  failed=true;
  console.error(JSON.stringify({role,connected:false,code:error?.code??'unknown'}));
 }finally{await db.end().catch(()=>undefined)}
}
if(failed)process.exitCode=1;
