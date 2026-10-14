import pg from 'pg';

const url=process.env.RESTORE_URL;
const expectedHost=process.env.MIGRATION_TARGET_HOST;
if(!url||!expectedHost||new URL(url).hostname!==expectedHost){
 throw new Error('RESTORE_URL must point to the expected migration database');
}
const links=[
 ['BookingLocation','bookingId','Booking','id'],
 ['BookingVia','bookingId','Booking','id'],
 ['BookingTimelineEvent','bookingId','Booking','id'],
 ['BookingTimelineEvent','webhookEventId','WebhookEvent','id'],
 ['BookingSnapshot','bookingId','Booking','id'],
 ['BookingSnapshot','webhookEventId','WebhookEvent','id'],
 ['WebhookEvent','bookingId','Booking','id'],
 ['Booking','normalCustomerId','NormalCustomer','id'],
];
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const db=new pg.Client({connectionString:url});
try{
 await db.connect();
 await db.query('BEGIN READ ONLY');
 const results=[];
 for(const [child,childColumn,parent,parentColumn] of links){
  const sql=`SELECT EXISTS (SELECT 1 FROM public.${quote(child)} c
   WHERE c.${quote(childColumn)} IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.${quote(parent)} p
    WHERE p.${quote(parentColumn)}=c.${quote(childColumn)})) AS has_orphan`;
  const hasOrphan=(await db.query(sql)).rows[0].has_orphan;
  results.push({child,column:childColumn,parent,hasOrphan});
 }
 await db.query('COMMIT');
 console.log(JSON.stringify({links:results,valid:results.every(row=>!row.hasOrphan)}));
}catch(error){
 await db.query('ROLLBACK').catch(()=>undefined);
 console.error('Booking-link verification failed:',error instanceof Error?error.message:'Unknown error');
 process.exitCode=1;
}finally{await db.end().catch(()=>undefined)}
