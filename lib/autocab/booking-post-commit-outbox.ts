import {requireAutocabIntegration} from '@/lib/integration-control';
import { prisma } from '@/lib/prisma';

type ClaimedEffect={webhookEventId:string;attemptCount:number};

function endpointConfiguration(){
 const raw=process.env.TAXICRM_BOOKING_EFFECTS_URL;
 const secret=process.env.BOOKING_EFFECTS_SHARED_SECRET;
 if(!raw||!secret)throw new Error('Booking effects endpoint is not configured.');
 const url=new URL(raw);
 if(url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname))){
  throw new Error('Booking effects endpoint must use HTTPS.');
 }
 return {url,secret};
}

async function claimEffects(limit:number):Promise<ClaimedEffect[]>{
 const batch=Math.max(1,Math.min(25,Math.floor(limit)));
 return prisma.$queryRaw<ClaimedEffect[]>`
  UPDATE public."BookingPostCommitEffect" effect
  SET status='PROCESSING',"attemptCount"=effect."attemptCount"+1,
      "leaseUntil"=now()+interval '2 minutes',"updatedAt"=now()
  WHERE effect."webhookEventId" IN (
    SELECT "webhookEventId" FROM public."BookingPostCommitEffect"
    WHERE (status='PENDING' AND "nextAttemptAt"<=now())
       OR (status='PROCESSING' AND "leaseUntil"<now())
    ORDER BY "nextAttemptAt","createdAt"
    LIMIT ${batch} FOR UPDATE SKIP LOCKED
  )
  RETURNING effect."webhookEventId",effect."attemptCount"`;
}

export async function drainBookingPostCommitEffects(limit=10){
 await requireAutocabIntegration();
 // Check configuration before claiming rows so a missing secret cannot strand
 // effects in PROCESSING until the lease expires.
 const {url,secret}=endpointConfiguration();
 const effects=await claimEffects(limit);
 let completed=0;
 for(const effect of effects){
  try{
   await requireAutocabIntegration();
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-booking-effects-secret':secret},body:JSON.stringify({webhookEventId:effect.webhookEventId}),cache:'no-store',signal:AbortSignal.timeout(30_000)});
   if(!response.ok)throw new Error(`CRM effects endpoint returned ${response.status}.`);
   await prisma.bookingPostCommitEffect.update({where:{webhookEventId:effect.webhookEventId},data:{status:'DONE',leaseUntil:null,processedAt:new Date(),lastError:null}});
   completed++;
  }catch(error){
   const delayMinutes=Math.min(60,2**Math.min(effect.attemptCount,6));
   await prisma.bookingPostCommitEffect.update({where:{webhookEventId:effect.webhookEventId},data:{status:'PENDING',leaseUntil:null,nextAttemptAt:new Date(Date.now()+delayMinutes*60_000),lastError:(error instanceof Error?error.message:'CRM effects request failed.').slice(0,500)}});
  }
 }
 return {claimed:effects.length,completed,failed:effects.length-completed};
}
