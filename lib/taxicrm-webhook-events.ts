import {withTaxiCrmReadOnly} from '@/lib/taxicrm-database';

export type TaxiCrmWebhookEvent={
 id:string;
 provider:string;
 eventType:string;
 externalBookingId:string|null;
 status:string;
 receivedAt:string;
 processedAt:string|null;
 updatedAt:string;
};

export async function latestTaxiCrmWebhookEvents():Promise<TaxiCrmWebhookEvent[]>{
 return withTaxiCrmReadOnly(async client=>{
  const result=await client.query<TaxiCrmWebhookEvent>(`SELECT id,provider,"eventType","externalBookingId",status::text status,
   "receivedAt","processedAt","updatedAt"
   FROM public."WebhookEvent" WHERE "eventType" LIKE 'Booking%'
   ORDER BY "receivedAt" DESC,id DESC LIMIT 100`);
  return result.rows;
 });
}
