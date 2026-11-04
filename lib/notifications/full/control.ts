import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {database} from '../../database';
import {sampleRule,fixture} from '../fixtures';
import {saveRule} from '../store';
import {fullStageGuard} from './guard';
import {nacStageAuth} from './nac-http';
import {v2Error} from '../v2/http';
export async function fullStageControlPOST(request:Request){try{
 const input=await nacStageAuth(request),db=database(),{scope}=fullStageGuard();
 if(input.action==='bootstrap'){
  const c=await db.connect();try{await c.query("SELECT pg_advisory_lock(hashtextextended('notifications-fullstage-bootstrap',0))");
   const marker=(await c.query("SELECT to_regclass('notification_stage_marker') AS marker,to_regclass('\"Booking\"') AS booking")).rows[0];
   if(!marker.marker){if(marker.booking)throw Error('STAGE_DATABASE_NOT_EMPTY');await c.query(await readFile(process.cwd()+'/staging/notifications/full/schema.sql','utf8'))}
  }finally{await c.query("SELECT pg_advisory_unlock(hashtextextended('notifications-fullstage-bootstrap',0))");c.release()}
  for(const event of ['booking.confirmed','driver.dispatched'] as const){const r=sampleRule(event);if(!(await db.query('SELECT 1 FROM notification_rules WHERE id=$1',[r.id])).rowCount){const saved=await saveRule(db,r,'save',0);await saveRule(db,saved,'activate',saved.version)}}
  return Response.json({mode:'DRY_RUN',database:'notifications_fullstage',initialized:true});
 }
 if(input.action==='seed'){
  if(!['booking.confirmed','driver.dispatched'].includes(String(input.event))||!['closed','open','app-account','cancelled','expired','unapproved','missing-field','no-grant','suppressed'].includes(String(input.scenario)))throw Error('INVALID_STAGE_SEED');
  const event=input.event as 'booking.confirmed'|'driver.dispatched',scenario=String(input.scenario),r=sampleRule(event),template=fixture(r).template;
  if(scenario==='unapproved')template.status='PENDING';
  const bookingId='SYNTHETIC-'+randomUUID(),id=randomUUID(),accountId=randomUUID(),at=new Date(Date.now()-(scenario==='expired'?3600000:1000)),revision=event==='booking.confirmed'?1:at.getTime();
  const c=await db.connect();try{await c.query('BEGIN');
   await c.query('INSERT INTO notification_stage_template(id,definition) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET definition=excluded.definition',[template.id,JSON.stringify(template)]);
   await c.query(`INSERT INTO "Booking"(id,"externalId","telephoneNumber","normalCustomerId","customerName","pickupDueTime","bookedAtTime","acceptedAt","driverId","vehicleId","driverForename","vehicleRegistration","bookingSource","cancelledAt") VALUES($1,$2,'+447700900001','SYNTHETIC-CUSTOMER-1',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,bookingId,scenario==='missing-field'?null:'Demo Passenger',new Date('2026-11-04T22:30:00Z'),at,event==='driver.dispatched'?at:null,event==='driver.dispatched'?'SYNTHETIC-DRIVER':null,event==='driver.dispatched'?'SYNTHETIC-VEHICLE':null,event==='driver.dispatched'?'Demo Driver':null,event==='driver.dispatched'?'DEMO 001':null,scenario==='app-account'?'WebApp':'Telephone',scenario==='cancelled'?new Date():null]);
   await c.query('INSERT INTO "BookingLocation"(id,"bookingId",type,address) VALUES($1,$2,\'PICKUP\',\'Example pickup, Plymouth\'),($3,$2,\'DESTINATION\',\'Example destination, Plymouth\')',[randomUUID(),id,randomUUID()]);
   if(scenario==='app-account'){await c.query('INSERT INTO customer_accounts(id,full_name,phone) VALUES($1,\'Demo Passenger\',\'+447700900001\')',[accountId]);await c.query("INSERT INTO web_booking_attempts(quote_id,user_id,external_booking_id,state) VALUES($1,$2,$3,'confirmed')",[randomUUID(),accountId,bookingId])}
   await c.query(`INSERT INTO "WhatsAppRecipientGrant"(scope,recipient,"customerId","serviceAllowed",suppressed,"verifiedAt","validUntil","proofType","proofReference","updatedBy") VALUES($1,'+447700900001','SYNTHETIC-CUSTOMER-1',$2,$3,now(),now()+interval '1 hour','OPERATOR_VERIFIED','SYNTHETIC-PROOF','stage-seeder') ON CONFLICT(scope,recipient) DO UPDATE SET "serviceAllowed"=excluded."serviceAllowed",suppressed=excluded.suppressed,"verifiedAt"=now(),"validUntil"=excluded."validUntil"`,[scope,scenario!=='no-grant',scenario==='suppressed']);
   await c.query(`INSERT INTO "WhatsAppConversation"(id,scope,participant) VALUES('SYNTHETIC-CONVERSATION',$1,'+447700900001') ON CONFLICT(scope,participant) DO NOTHING`,[scope]);
   // Synthetic inbound evidence is deliberately separate from booking creation/outbound history.
   await c.query('DELETE FROM "WhatsAppMessage" WHERE scope=$1 AND direction=\'INBOUND\'',[scope]);
   if(scenario==='open')await c.query(`INSERT INTO "WhatsAppMessage"(scope,"conversationId","providerMessageId",direction,content,status,"occurredAt") VALUES($1,'SYNTHETIC-CONVERSATION',$2,'INBOUND','{"text":"Synthetic customer request","type":"text","origin":"customer","synthetic":true}','RECEIVED',now()-interval '1 hour')`,[scope,'synthetic-inbound:'+randomUUID()]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  return Response.json({booking_id:bookingId,rule_id:r.id,occurred_at:at.toISOString(),revision,conversation_id:'SYNTHETIC-CONVERSATION',mode:'DRY_RUN'});
 }
 if(input.action==='cancel'){
  if(typeof input.booking_id!=='string'||!input.booking_id.startsWith('SYNTHETIC-'))throw Error('INVALID_STAGE_BOOKING');await db.query('UPDATE "Booking" SET "cancelledAt"=now(),status=\'CANCELLED\' WHERE "externalId"=$1',[input.booking_id]);return Response.json({cancelled:true});
 }
 if(input.action==='history'){
  if(typeof input.booking_id!=='string'||!input.booking_id.startsWith('SYNTHETIC-'))throw Error('INVALID_STAGE_BOOKING');
  const events=(await db.query('SELECT result FROM notification_stage_delivery WHERE scope=$1 AND operation_key LIKE $2',[scope,'autocab:'+input.booking_id+':%'])).rows;
  return Response.json({mode:'DRY_RUN',notification_decisions:(await db.query('SELECT decision FROM notification_decisions WHERE booking_id=$1',[input.booking_id])).rows,events:events.map(r=>r.result),messages:(await db.query(`SELECT content,status,"providerMessageId" FROM "WhatsAppMessage" WHERE scope=$1 AND content->>'booking_id'=$2`,[scope,input.booking_id])).rows,shared_events:(await db.query(`SELECT type,payload FROM "WhatsAppSharedEvent" WHERE scope=$1 AND payload->>'booking_id'=$2`,[scope,input.booking_id])).rows});
 }
 throw Error('INVALID_STAGE_ACTION');
 }catch(e){return v2Error(e)}}
