import pg from 'pg';

const targetUrl=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
const apply=process.argv.includes('--apply');
const driverPositionFloor=process.env.MIGRATION_DRIVER_POSITION_FLOOR
 ?BigInt(process.env.MIGRATION_DRIVER_POSITION_FLOOR):null;
if(!targetUrl||!expectedHost||new URL(targetUrl).hostname!==expectedHost){
 throw new Error('RESTORE_URL must point to the expected migration database');
}
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const db=new pg.Client({connectionString:targetUrl});
try{
 await db.connect();
 const rows=(await db.query(`SELECT tbl.relname AS table_name,col.attname AS column_name,
  seq.relname AS sequence_name
  FROM pg_class seq
  JOIN pg_namespace ns ON ns.oid=seq.relnamespace
  JOIN pg_depend dep ON dep.objid=seq.oid AND dep.deptype IN ('a','i')
  JOIN pg_class tbl ON tbl.oid=dep.refobjid
  JOIN pg_attribute col ON col.attrelid=tbl.oid AND col.attnum=dep.refobjsubid
  WHERE ns.nspname='public' AND seq.relkind='S' AND tbl.relkind IN ('r','p')
  ORDER BY tbl.relname,col.attname`)).rows;
 const results=[];
 for(const row of rows){
  const table=`public.${quote(row.table_name)}`;
  const sequence=`public.${quote(row.sequence_name)}`;
  const column=quote(row.column_name);
  const max=(await db.query(`SELECT ${column} AS value FROM ${table}
   ORDER BY ${column} DESC LIMIT 1`)).rows[0]?.value??null;
  const state=(await db.query(`SELECT last_value,is_called FROM ${sequence}`)).rows[0];
  const maxValue=max===null?null:BigInt(max);
  const lastValue=BigInt(state.last_value);
  let needed=maxValue===null?lastValue:maxValue>lastValue?maxValue:lastValue;
  if(row.table_name==='driver_positions'&&driverPositionFloor!==null){
   if(driverPositionFloor<=0n||driverPositionFloor>9223372036854775807n){
    throw new Error('MIGRATION_DRIVER_POSITION_FLOOR must be a positive bigint');
   }
   if(driverPositionFloor>needed)needed=driverPositionFloor;
  }
  if(apply&&needed>lastValue){
   await db.query('SELECT setval($1::regclass,$2::bigint,true)',[sequence,needed.toString()]);
  }
  results.push({table:row.table_name,column:row.column_name,sequence:row.sequence_name,
   highestRowId:maxValue?.toString()??null,previousSequenceValue:lastValue.toString(),
   requiredSequenceValue:needed.toString(),advanced:apply&&needed>lastValue});
 }
 console.log(JSON.stringify({mode:apply?'applied':'plan',sequences:results}));
}catch(error){
 console.error('Sequence alignment failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await db.end().catch(()=>undefined)}
