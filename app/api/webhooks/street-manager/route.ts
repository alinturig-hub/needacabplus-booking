import {database} from '@/lib/database';
import {boundedText,confirmationUrl,envelopeSchema,eventSchema,verifyEnvelope} from '@/lib/street-manager/sns';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 let envelope;
 try{envelope=envelopeSchema.parse(JSON.parse(await boundedText(new Response(request.body),300000)))}catch(error){return Response.json({error:error instanceof Error&&error.message==='BODY_TOO_LARGE'?'Payload too large.':'Invalid SNS envelope.'},{status:error instanceof Error&&error.message==='BODY_TOO_LARGE'?413:400})}
 try{await verifyEnvelope(envelope)}catch(error){const transient=error instanceof TypeError||(error instanceof Error&&['CERTIFICATE_UNAVAILABLE','TimeoutError','AbortError'].includes(error.message==='CERTIFICATE_UNAVAILABLE'?error.message:error.name));return Response.json({error:transient?'SNS verification temporarily unavailable.':'SNS verification failed.'},{status:transient?503:403})}
 if(envelope.Type==='UnsubscribeConfirmation')return Response.json({received:true,action:'ignored'});
 if(envelope.Type==='SubscriptionConfirmation'){
  try{
   // Check durable storage exists before confirming upstream; no run-time schema changes.
   await database().query('SELECT topic_arn FROM street_manager_subscriptions LIMIT 0');
   const response=await fetch(confirmationUrl(envelope),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('CONFIRMATION_FAILED');
   const xml=await boundedText(response,16384),arn=xml.match(/<SubscriptionArn>([^<]+)<\/SubscriptionArn>/)?.[1];
   if(!arn?.startsWith(envelope.TopicArn+':'))throw Error('INVALID_SUBSCRIPTION_ARN');
   await database().query('INSERT INTO street_manager_subscriptions(topic_arn,subscription_arn) VALUES($1,$2) ON CONFLICT(topic_arn) DO UPDATE SET subscription_arn=EXCLUDED.subscription_arn,confirmed_at=now()',[envelope.TopicArn,arn]);
   return Response.json({confirmed:true});
  }catch{return Response.json({error:'Subscription confirmation unavailable; retry required.'},{status:503})}
 }
 let event;
 try{event=eventSchema.parse(JSON.parse(envelope.Message))}catch{return Response.json({error:'Invalid Street Manager event.'},{status:400})}
 try{
  const result=await database().query(`INSERT INTO street_manager_events(topic_arn,message_id,event_reference,event_type,object_type,object_reference,event_time,sns_timestamp,schema_version,event_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING message_id`,[envelope.TopicArn,envelope.MessageId,String(event.event_reference),event.event_type,event.object_type,event.object_reference,event.event_time,envelope.Timestamp,event.version,JSON.stringify(event)]);
  return Response.json({received:true,duplicate:result.rowCount===0});
 }catch{return Response.json({error:'Event storage unavailable; retry required.'},{status:503})}
}
