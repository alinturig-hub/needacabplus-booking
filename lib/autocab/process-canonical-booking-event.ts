import { Prisma } from '@/generated/prisma/client';
import { applyCanonicalBookingEvent, isCanonicalBookingEvent } from '@/lib/autocab/canonical-booking-handler';
import { prisma } from '@/lib/prisma';

async function lockEvent(tx:Prisma.TransactionClient,id:string){
 await tx.$queryRaw`SELECT "id" FROM "WebhookEvent" WHERE "id" = ${id} FOR UPDATE`;
}

// Invoked by the secret-authenticated worker only when the exclusive writer
// flag has been enabled after TaxiCRM has stopped processing Booking events.
export async function processCanonicalBookingEvent(webhookEventId:string):Promise<void>{
 try{
  await prisma.$transaction(async tx=>{
   await lockEvent(tx,webhookEventId);
   const event=await tx.webhookEvent.findUnique({where:{id:webhookEventId},include:{webhookConfiguration:true}});
   if(!event)throw new Error(`WebhookEvent not found: ${webhookEventId}`);
   if(event.status==='PROCESSED'||event.status==='IGNORED')return;
   if(!event.webhookConfiguration?.isEnabled||!isCanonicalBookingEvent(event.eventType)){
    await tx.webhookEvent.update({where:{id:event.id},data:{status:'IGNORED',processedAt:new Date(),processingError:!isCanonicalBookingEvent(event.eventType)?'No canonical booking handler registered for event type.':null}});
    return;
   }
   await tx.webhookEvent.update({where:{id:event.id},data:{status:'PROCESSING',processingError:null,attemptCount:{increment:1}}});
   await applyCanonicalBookingEvent(tx,event.id,event.eventType);
   await tx.webhookEvent.update({where:{id:event.id},data:{status:'PROCESSED',processingError:null,processedAt:new Date()}});
  },{maxWait:10_000,timeout:30_000});
 }catch(error){
  await prisma.$transaction(async tx=>{
   await lockEvent(tx,webhookEventId);
   await tx.webhookEvent.updateMany({where:{id:webhookEventId,status:{notIn:['PROCESSED','IGNORED']}},data:{status:'FAILED',processedAt:null,attemptCount:{increment:1},processingError:(error instanceof Error?error.message:'Unknown webhook processing error.').slice(0,5000)}});
  });
  throw error;
 }
}
