import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {recoverAssignmentDetails,canonicalAssignmentFields} from '../lib/autocab/assignment-details.mjs';
import {recoverBookingDetails} from '../lib/autocab/booking-detail-recovery.mjs';
export const REPAIR_JOB='saved-json-details-v1';
const allowed=new Set(['driverId','vehicleId',...Object.values(canonicalAssignmentFields).flatMap(Object.values),'assignmentDetails','pickupDueTime','dropOffDueTime','bookedAtTime','dispatchedAt','arrivedAt','pickedUpAt','completedAt','cancelledAt','acceptedAt','noFareAt','distance','systemDistance','meterDistance','estimatedDistance','estimatedPrice','fare','price','cost','extraCost','gratuityAmount','pricingTariff','pricingSource','estimatedTime','driverNote','officeNote','flightDetails','cabExchangeReference']);
const quoted=x=>'"'+x.replaceAll('"','""')+'"';
export async function repairBatch(db,{limit=250,dryRun=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='60s'");
  await db.query(`INSERT INTO autocab_history.assignment_repair_progress(job_key,cutoff) VALUES($1,now() AT TIME ZONE 'UTC') ON CONFLICT DO NOTHING`,[REPAIR_JOB]);
  const {rows:[progress]}=await db.query('SELECT * FROM autocab_history.assignment_repair_progress WHERE job_key=$1 FOR UPDATE',[REPAIR_JOB]);
  if(progress.done){await db.query(dryRun?'ROLLBACK':'COMMIT');return progress}
  const {rows:keys}=await db.query(`SELECT id,"externalId" FROM public."Booking" WHERE provider='AUTOCAB' AND id>$1 AND "createdAt"<=$2 ORDER BY id LIMIT $3`,[progress.last_id,progress.cutoff,limit]);
  if(!keys.length){await db.query('UPDATE autocab_history.assignment_repair_progress SET done=true,updated_at=now() WHERE job_key=$1',[REPAIR_JOB]);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...progress,done:true}}
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('AUTOCAB:booking:'||ref,0)) FROM (SELECT unnest($1::text[]) ref ORDER BY ref) ordered",[keys.map(x=>x.externalId)]);
  const ids=keys.map(x=>x.id),refs=keys.map(x=>x.externalId);
  const {rows:bookings}=await db.query('SELECT * FROM public."Booking" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[ids]);
  const {rows:locations}=await db.query('SELECT * FROM public."BookingLocation" WHERE "bookingId"=ANY($1::text[])',[ids]);
  const {rows:vias}=await db.query('SELECT * FROM public."BookingVia" WHERE "bookingId"=ANY($1::text[]) ORDER BY position',[ids]);
  const {rows:projections}=await db.query('SELECT autocab_id ref,raw_payload payload FROM public.autocab_bookings WHERE autocab_id=ANY($1::text[])',[refs]);
  const {rows:webhooks}=await db.query(`SELECT "externalBookingId" ref,id,payload FROM public."WebhookEvent" WHERE "externalBookingId"=ANY($1::text[]) AND status='PROCESSED' AND lower("eventType") NOT LIKE '%reject%' ORDER BY "receivedAt" DESC,id DESC`,[refs]);
  const {rows:archives}=await db.query(`SELECT e.original_booking_id ref,e.autocab_id id,e.raw_payload payload FROM unnest($1::text[]) ref JOIN LATERAL (SELECT * FROM autocab_history.entries e WHERE e.original_booking_id=ref ORDER BY e.archived_booking->>'archiveTime' DESC NULLS LAST,e.autocab_id DESC) e ON true`,[refs]);
  const group=rows=>{const map=new Map();for(const r of rows){if(!map.has(r.ref))map.set(r.ref,[]);map.get(r.ref).push(r)}return map};
  const projectionByRef=group(projections),webhookByRef=group(webhooks),archiveByRef=group(archives);
  const changes=[];let matched=0;
  for(const b of bookings){
   const docs=[{kind:'canonical_raw',id:b.id,payload:b.rawPayload},...(projectionByRef.get(b.externalId)||[]).map(x=>({kind:'projection',id:x.ref,payload:x.payload})),...(webhookByRef.get(b.externalId)||[]).map(x=>({kind:'webhook',id:x.id,payload:x.payload})),...(archiveByRef.get(b.externalId)||[]).map(x=>({kind:'archive',id:x.id,payload:x.payload}))];
   const assignment=recoverAssignmentDetails(b,docs,{onlyWhenAddsInformation:true});matched+=assignment.matched;
   const loc=locations.filter(x=>x.bookingId===b.id),via=vias.filter(x=>x.bookingId===b.id);
   const general=recoverBookingDetails(b,docs,loc,via);
   const patch={...general.patch,...assignment.patch,...(assignment.changed?{assignmentDetails:assignment.details}:{})};
   if(!Object.keys(patch).length&&!general.locations.length&&!general.vias.length)continue;
   for(const key of Object.keys(patch))if(!allowed.has(key))throw new Error('Unexpected repair field');
   changes.push({id:b.id,patch,before:Object.fromEntries(Object.keys(patch).map(k=>[k,b[k]??null])),locations:general.locations,vias:general.vias,beforeLocations:loc,beforeVias:via,sources:{...general.sources,assignment:assignment.details.sources}});
  }
  if(!dryRun){
   const columns=[...new Set(changes.flatMap(x=>Object.keys(x.patch)))];
   if(columns.length)await db.query(`WITH changes AS (SELECT value->>'id' id,value->'patch' patch FROM jsonb_array_elements($1::jsonb)),typed AS (SELECT c.id repair_id,c.patch,(jsonb_populate_record(NULL::public."Booking",c.patch)).* FROM changes c) UPDATE public."Booking" b SET ${columns.map(k=>`${quoted(k)}=CASE WHEN t.patch ? '${k}' THEN t.${quoted(k)} ELSE b.${quoted(k)} END`).join(',')} FROM typed t WHERE b.id=t.repair_id`,[JSON.stringify(changes.filter(x=>Object.keys(x.patch).length).map(x=>({id:x.id,patch:x.patch})))]);
   for(const change of changes)for(const [table,rows,unique] of [['BookingLocation',change.locations,'type'],['BookingVia',change.vias,'position']])for(const loc of rows){
    const columns=['id','bookingId',unique,'createdAt','updatedAt',...Object.keys(loc).filter(k=>k!==unique)];
    const values=[randomUUID(),change.id,loc[unique],new Date(),new Date(),...Object.entries(loc).filter(([k])=>k!==unique).map(([,v])=>v)];
    await db.query(`INSERT INTO public.${quoted(table)}(${columns.map(quoted).join(',')}) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT ("bookingId",${quoted(unique)}) DO UPDATE SET ${Object.keys(loc).filter(k=>k!==unique&&k!=='address').map(k=>`${quoted(k)}=COALESCE(NULLIF(${quoted(table)}.${quoted(k)}::text,''),EXCLUDED.${quoted(k)}::text)${['latitude','longitude'].includes(k)?'::numeric':''}`).join(',')||'address=EXCLUDED.address'} WHERE ${quoted(table)}.address=EXCLUDED.address`,values);
   }
   if(changes.length)await db.query(`INSERT INTO autocab_history.assignment_repair_audit(job_key,booking_id,before_fields,after_fields,sources) SELECT $1,value->>'id',jsonb_build_object('booking',value->'before','locations',value->'beforeLocations','vias',value->'beforeVias'),jsonb_build_object('booking',value->'patch','locations',value->'locations','vias',value->'vias'),value->'sources' FROM jsonb_array_elements($2::jsonb) ON CONFLICT(job_key,booking_id) DO NOTHING`,[REPAIR_JOB,JSON.stringify(changes)]);
   await db.query('UPDATE autocab_history.assignment_repair_progress SET last_id=$2,checked=checked+$3,changed=changed+$4,matched=matched+$5,updated_at=now() WHERE job_key=$1',[REPAIR_JOB,keys.at(-1).id,keys.length,changes.length,matched]);
  }
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {checked:keys.length,changed:changes.length,matched,done:false,dryRun};
 }catch(error){await db.query('ROLLBACK');throw error}
}
export async function run(env=process.env){
 const url=new URL(env.DATABASE_URL||'');if(url.hostname!=='q9fahphg3lydu18inysgmerq'||url.pathname!=='/postgres')throw Error('Unexpected repair database');
 const limit=Number(env.BOOKING_DETAILS_BATCH||250),minutes=Number(env.BOOKING_DETAILS_MINUTES||55),max=Number(env.BOOKING_DETAILS_MAX||3000000),dryRun=env.BOOKING_DETAILS_DRY_RUN==='true';
 if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isFinite(minutes)||minutes<1||minutes>580||!Number.isInteger(max)||max<1||max>4000000)throw Error('Invalid repair limits');
 const db=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:10000});let stop=false;const stopping=()=>{stop=true};process.on('SIGTERM',stopping);process.on('SIGINT',stopping);
 try{
  await db.connect();const {rows:[lock]}=await db.query("SELECT pg_try_advisory_lock(hashtext('booking-saved-json-detail-repair')) locked");if(!lock.locked){console.log('Repair already running');return}
  let checked=0,changed=0,batches=0,errors=0;const started=Date.now();
  while(!stop&&checked<max&&Date.now()-started<minutes*60000){
   try{const result=await repairBatch(db,{limit:Math.min(limit,max-checked),dryRun});checked+=Number(result.checked||0);changed+=Number(result.changed||0);batches++;errors=0;if(batches%10===1||dryRun||result.done)console.log(JSON.stringify({checked,changed,done:result.done,dryRun,seconds:Math.round((Date.now()-started)/1000)}));if(dryRun||result.done)break}
   catch(error){if(!['55P03','57014','40P01','40001'].includes(error.code)||++errors>5)throw error;console.log(JSON.stringify({retry:errors,code:error.code}));await new Promise(resolve=>setTimeout(resolve,1000*errors))}
  }
  const {rows:[progress]}=await db.query('SELECT checked,changed,done,updated_at FROM autocab_history.assignment_repair_progress WHERE job_key=$1',[REPAIR_JOB]);console.log(JSON.stringify({progress}));
 }finally{process.off('SIGTERM',stopping);process.off('SIGINT',stopping);await db.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(error=>{console.error('Detail repair failed ('+(error.code||error.name)+').');process.exitCode=1});
