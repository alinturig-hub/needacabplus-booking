import pg from 'pg';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {autocabIso} from '../lib/autocab-time.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'?x:typeof x==='number'&&Number.isFinite(x)?String(x):null;
const number=x=>x!==null&&x!==''&&!(typeof x==='string'&&!x.trim())&&['string','number'].includes(typeof x)&&Number.isFinite(Number(x))?String(x):null;
const integer=(x,fallback)=>number(x)!==null&&Number.isInteger(Number(x))?Number(x):fallback;
const utc=x=>{const iso=autocabIso(x);return iso&&Date.parse(iso)>=0?iso.slice(0,-1):null};
const id=(kind,value)=>`archive_${kind}_${createHash('sha256').update(value).digest('hex')}`;
export const MONEY=['fare','cost','price','accountAmount','cashAmount','cardAmount','extraCost','fixedCost','fixedPrice','chargingAreaCost','chargingAreaPrice','waitingTime','waitingTimeChargeable','gratuityAmount'];
export const DECIMALS=[...MONEY,'distance','systemDistance','meterDistance','gpsMeterDistance','gpsMeterPrice','estimatedDistance','estimatedPrice'];
export const DATES=['pickupDueTime','dropOffDueTime','bookedAtTime','dispatchedAt','arrivedAt','pickedUpAt','completedAt','createdAt','updatedAt'];
export const TEXTS=['id','provider','externalId','originalBookingId','bookingType','typeOfBooking','status','customerName','telephoneNumber','customerEmail','paymentType','accountCode','companyId','driverId','driverCallSign','driverBadgeNumber','vehicleId','vehicleCallSign','vehicleRegistration','vehiclePlateNumber','driverNote','officeNote','ourReference','bookingSource','bookedBy','loyaltyCardId','costSource','pricingTariff','pricingSource','estimatedTime'];
export const INTS=['priority','passengers','luggage'];
export const JSONS=['rawPayload','capabilities','yourReferences','promotionCodeDiscount'];
export const FIELDS=[...TEXTS,...DATES,...DECIMALS,...INTS,...JSONS,'loyaltyCardCostValue','isStreetPickup'];
export function mapEntry(entry){
 const r=entry.raw_payload;if(!object(r)||!object(r.archivedBooking))throw new Error('Invalid historical JSON');
 const a=r.archivedBooking,ref=text(a.originalAutoID);
 if(!ref||ref!==entry.original_booking_id||String(r.id)!==entry.autocab_id)throw new Error('Archive identity mismatch');
 const pricing=object(r.pricing)?r.pricing:{},driver=object(a.driver)?a.driver:{},vehicle=object(a.vehicle)?a.vehicle:{};
 const reason=text(a.reason),flags=[];
 const statuses={Completed:'COMPLETED',ExchangedCompleted:'COMPLETED',Cancelled:'CANCELLED',ExchangedCancelled:'CANCELLED',NoJob:'ARCHIVED_NO_JOB',ExchangedNoJob:'ARCHIVED_NO_JOB',Dispatched:'ARCHIVED_DISPATCHED',Recover:'ARCHIVED_RECOVERED',Skipped:'ARCHIVED_SKIPPED',Suspended:'ARCHIVED_SUSPENDED'};
 let status=statuses[reason]??'ARCHIVED_REVIEW';
 if(!statuses[reason])flags.push('UNKNOWN_ARCHIVE_REASON');
 if(entry.ambiguous){status='ARCHIVED_REVIEW';flags.push('TIED_ARCHIVE_STATES')}
 if(!utc(a.archiveTime)){status='ARCHIVED_REVIEW';flags.push('UNKNOWN_ARCHIVE_TIME')}
 if(status.startsWith('ARCHIVED_'))flags.push('HISTORICAL_STATE_NOT_LIVE_DISPATCH');
 if(reason==='NoJob'||reason==='ExchangedNoJob')flags.push('NO_JOB_IS_NOT_ASSUMED_NO_FARE');
 const now=new Date().toISOString().slice(0,-1);
 const booking=Object.fromEntries(FIELDS.map(k=>[k,null]));
 Object.assign(booking,{id:id('booking',ref),provider:'AUTOCAB',externalId:ref,originalBookingId:ref,bookingType:'Archived',typeOfBooking:text(r.bookingType),status,
  customerName:text(r.name),telephoneNumber:text(r.telephoneNumber),customerEmail:text(r.customerEmail),paymentType:text(r.paymentType),accountCode:text(r.accountCode),companyId:text(r.companyId),
  driverId:text(driver.id),driverCallSign:text(driver.callsign),driverBadgeNumber:text(a.badgeNumber),vehicleId:text(vehicle.id),vehicleCallSign:text(vehicle.callsign),vehicleRegistration:text(a.regNumber),vehiclePlateNumber:text(a.plateNumber),
  driverNote:text(r.driverNote),officeNote:text(r.officeNote),ourReference:text(r.ourReference),bookingSource:text(r.bookingSource),bookedBy:text(r.bookerName),loyaltyCardId:text(r.loyaltyCardId),
  pickupDueTime:utc(r.pickupDueTimeUtc??r.pickupDueTime),dropOffDueTime:utc(r.dropOffTimeUtc??r.dropOffTime),bookedAtTime:utc(r.bookedAtTime),dispatchedAt:utc(a.dispatchedAtTime),arrivedAt:utc(a.vehicleArrivedAtTime),pickedUpAt:utc(a.pickedUpAtTime),completedAt:utc(a.completedAtTime),
  priority:integer(r.priority,0),passengers:integer(r.passengers,1),luggage:integer(r.luggage,0),loyaltyCardCostValue:number(pricing.loyaltyCardCost)??'0',isStreetPickup:typeof r.isStreetPickup==='boolean'?r.isStreetPickup:false,
  rawPayload:r,capabilities:r.capabilities??null,yourReferences:r.yourReferences??null,promotionCodeDiscount:r.promotionCodeDiscount??pricing.promotionCodeDiscount??null,createdAt:now,updatedAt:now});
 for(const k of MONEY)booking[k]=number(pricing[k]);
 for(const k of ['costSource','pricingTariff','pricingSource'])booking[k]=text(pricing[k]);
 booking.distance=number(r.distance);booking.systemDistance=number(a.systemDistance);booking.meterDistance=number(pricing.meterDistance);booking.gpsMeterDistance=number(pricing.gpsMeterDistance);booking.gpsMeterPrice=number(pricing.gpsMeterPrice);
 if(status!=='COMPLETED')booking.completedAt=null;
 if(status==='COMPLETED'&&!booking.completedAt)flags.push('COMPLETED_TIMESTAMP_MISSING');
 // Unknown source values remain in rawPayload and all original stages remain in entries.
 const locations=[];
 for(const [key,type] of [['pickup','PICKUP'],['destination','DESTINATION']]){const v=mapLocation(r[key],booking.id,type);if(v)locations.push(v)}
 const vias=Array.isArray(r.vias)?r.vias.flatMap((v,position)=>{const mapped=mapLocation(v,booking.id,`VIA_${position}`);if(!mapped)return [];const rest={...mapped,position};delete rest.type;return [rest]}):[];
 return {booking,locations,vias,flags};
}
export function mapLocation(value,bookingId,type){
 if(!object(value)||!object(value.address)||typeof value.address.text!=='string'||!value.address.text.trim())return null;
 const a=value.address,c=object(a.coordinate)?a.coordinate:{},z=object(a.zone)?a.zone:{};
 const valid=(v,min,max)=>number(v)!==null&&Number(v)>=min&&Number(v)<=max?number(v):null;
 const now=new Date().toISOString().slice(0,-1);
 return {id:id('location',`${bookingId}:${type}`),bookingId,type,address:a.text,zoneId:text(z.id??a.zoneId),zoneDescriptor:text(z.descriptor),zoneName:text(z.name),longitude:valid(c.longitude,-180,180),latitude:valid(c.latitude,-90,90),createdAt:now,updatedAt:now};
}
export const PREPARE_SQL=`
 INSERT INTO autocab_history.canonical_queue(original_booking_id,source_entry_id,archive_time)
 SELECT DISTINCT ON(e.original_booking_id) e.original_booking_id,e.autocab_id,
  CASE WHEN e.archived_booking->>'archiveTime' ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN (e.archived_booking->>'archiveTime')::timestamptz END AS occurred
 FROM autocab_history.entries e
 WHERE e.original_booking_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Booking" b WHERE b.provider='AUTOCAB' AND b."externalId"=e.original_booking_id)
 ORDER BY e.original_booking_id,occurred DESC NULLS LAST,e.autocab_id::numeric DESC
 ON CONFLICT(original_booking_id) DO NOTHING`;
export async function prepareQueue(db){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL statement_timeout='180s'");
  await db.query(PREPARE_SQL);
  await db.query(`UPDATE autocab_history.canonical_queue q SET ambiguous=true WHERE q.state='PENDING' AND EXISTS(SELECT 1 FROM autocab_history.entries e JOIN autocab_history.entries chosen ON chosen.autocab_id=q.source_entry_id WHERE e.original_booking_id=q.original_booking_id AND e.autocab_id<>q.source_entry_id AND e.archived_booking->>'reason' IS DISTINCT FROM chosen.archived_booking->>'reason' AND CASE WHEN e.archived_booking->>'archiveTime' ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN (e.archived_booking->>'archiveTime')::timestamptz END=q.archive_time)`);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e}
}
async function insertRecords(db,table,fields,records,conflict,returning=''){
 if(!records.length)return {rows:[]};
 const cols=fields.map(f=>`"${f}"`).join(',');
 return db.query(`INSERT INTO public."${table}"(${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::public."${table}",$1::jsonb) ON CONFLICT ${conflict} DO NOTHING ${returning}`,[JSON.stringify(records)]);
}
export async function reconcileBatch(db,entries){
 const mapped=entries.map(mapEntry),refs=mapped.map(x=>x.booking.externalId).sort();
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='60s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('AUTOCAB:booking:'||ref,0)) FROM (SELECT unnest($1::text[]) AS ref ORDER BY ref) s",[refs]);
  const inserted=await insertRecords(db,'Booking',FIELDS,mapped.map(x=>x.booking),'("provider","externalId")','RETURNING id,"externalId"');
  const newIds=new Set(inserted.rows.map(x=>x.id));
  const fresh=mapped.filter(x=>newIds.has(x.booking.id));
  const locFields=['id','bookingId','type','address','zoneId','zoneDescriptor','zoneName','longitude','latitude','createdAt','updatedAt'];
  await insertRecords(db,'BookingLocation',locFields,fresh.flatMap(x=>x.locations),'("bookingId","type")');
  await insertRecords(db,'BookingVia',locFields.filter(k=>k!=='type').concat('position'),fresh.flatMap(x=>x.vias),'("bookingId","position")');
  for(const x of mapped){
   const {rows:[current]}=await db.query('SELECT id FROM public."Booking" WHERE provider=\'AUTOCAB\' AND "externalId"=$1',[x.booking.externalId]);
   if(!current)throw new Error('Canonical booking not present after reconciliation');
   await db.query("UPDATE autocab_history.canonical_queue SET state=$2,canonical_booking_id=$3,mapped_status=$4,review_flags=$5::jsonb,processed_at=now() WHERE original_booking_id=$1 AND state='PENDING'",[x.booking.externalId,newIds.has(current.id)?'IMPORTED':'EXISTING',current.id,x.booking.status,JSON.stringify(x.flags)]);
  }
  await db.query('COMMIT');return {inserted:inserted.rows.length,existing:mapped.length-inserted.rows.length};
 }catch(e){await db.query('ROLLBACK');throw e}
}
export async function run(env=process.env){
 const url=new URL(env.DATABASE_URL??'');
 if(url.hostname!=='q9fahphg3lydu18inysgmerq'||url.pathname!=='/postgres')throw new Error('Unexpected reconciliation database');
 const db=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:10000});
 const max=Number(env.AUTOCAB_RECONCILE_MAX_BOOKINGS??1000000),minutes=Number(env.AUTOCAB_RECONCILE_MAX_MINUTES??28);
 if(!Number.isInteger(max)||max<1||max>1000000||!Number.isInteger(minutes)||minutes<1||minutes>120)throw new Error('Invalid reconciliation limits');
 let stop=false;const onStop=()=>{stop=true};process.on('SIGTERM',onStop);process.on('SIGINT',onStop);
 try{
  await db.connect();
  const {rows:[lock]}=await db.query("SELECT pg_try_advisory_lock(hashtext('autocab-canonical-reconcile')) AS acquired");
  if(!lock.acquired){console.log('Reconciliation already running');return}
  const {rows:[copied]}=await db.query("SELECT done,copied_rows=source_rows AS counts_match FROM autocab_history.copy_progress WHERE job='archive-20261020-to-shared-live-v1'");
  if(!copied?.done||!copied.counts_match)throw new Error('Full history copy is required');
  const {rows:triggers}=await db.query(`SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D' AND tgrelid IN('public."Booking"'::regclass,'public."BookingLocation"'::regclass,'public."BookingVia"'::regclass)`);
  if(triggers.length)throw new Error('Canonical tables have unreviewed database triggers');
  if(process.argv.includes('--prepare'))await prepareQueue(db);
  if(!process.argv.includes('--apply')){
   const {rows}=await db.query('SELECT state,count(*)::text AS bookings,count(*) FILTER(WHERE ambiguous)::text AS ambiguous FROM autocab_history.canonical_queue GROUP BY state');
   console.log(JSON.stringify({event:'canonical_reconciliation_preflight',queue:rows}));return;
  }
  const deadline=Date.now()+minutes*60000;let total=0;
  while(!stop&&Date.now()<deadline&&total<max){
   const {rows}=await db.query(`SELECT e.autocab_id,e.original_booking_id,e.raw_payload,q.ambiguous FROM autocab_history.canonical_queue q JOIN autocab_history.entries e ON e.autocab_id=q.source_entry_id WHERE q.state='PENDING' ORDER BY q.original_booking_id LIMIT $1`,[Math.min(100,max-total)]);
   if(!rows.length){console.log(JSON.stringify({event:'canonical_reconciliation_queue_complete',processedThisRun:total}));break}
   const result=await reconcileBatch(db,rows);total+=rows.length;
   console.log(JSON.stringify({event:'canonical_reconciliation_batch',...result,processedThisRun:total}));
   await new Promise(r=>setTimeout(r,100));
  }
 }finally{process.off('SIGTERM',onStop);process.off('SIGINT',onStop);await db.end().catch(()=>undefined)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){run().catch(e=>{console.error(JSON.stringify({event:'canonical_reconciliation_stopped',code:e.code??'RECONCILIATION_CHECK_FAILED'}));process.exitCode=1})}
