import {isDispatchUser} from '@/lib/security';
import {bookingEvents} from '@/lib/booking-events';
import {taxiCrmBookingReadEnabled} from '@/lib/taxicrm-database';
import {latestTaxiCrmWebhookEvents,type TaxiCrmWebhookEvent} from '@/lib/taxicrm-webhook-events';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(request:Request){
 if(!await isDispatchUser())return Response.json({error:'Administrator access required.'},{status:403});
 if(taxiCrmBookingReadEnabled()){
  let initial:TaxiCrmWebhookEvent[];
  try{initial=await latestTaxiCrmWebhookEvents()}catch{
   return Response.json({error:'TaxiCRM webhook events are unavailable.'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
  const encoder=new TextEncoder();let timer:ReturnType<typeof setInterval>|undefined,closed=false,busy=false;
  const stream=new ReadableStream({start(controller){
   const send=(name:string,data:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`))};
   const close=()=>{if(closed)return;closed=true;clearInterval(timer);try{controller.close()}catch{}};
   let seen=new Map(initial.map(event=>[event.id,`${event.status}|${event.processedAt}|${event.updatedAt}`]));
   controller.enqueue(encoder.encode('retry: 2000\n\n'));
   send('snapshot',{events:initial.slice(0,10),checkedAt:new Date().toISOString()});
   const poll=async()=>{if(closed||busy)return;busy=true;try{
    const current=await latestTaxiCrmWebhookEvents();
    const changed=current.filter(event=>seen.get(event.id)!==`${event.status}|${event.processedAt}|${event.updatedAt}`);
    seen=new Map(current.map(event=>[event.id,`${event.status}|${event.processedAt}|${event.updatedAt}`]));
    if(changed.length)send('booking',{events:changed.slice(0,30),checkedAt:new Date().toISOString()});
    else controller.enqueue(encoder.encode(': keep-alive\n\n'));
   }catch{send('backend-error',{message:'TaxiCRM webhook connection lost.'});close()}finally{busy=false}};
   timer=setInterval(()=>void poll(),3000);
   request.signal.addEventListener('abort',close,{once:true});
  },cancel(){closed=true;clearInterval(timer)}});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
 }
 const encoder=new TextEncoder();let heartbeat:ReturnType<typeof setInterval>;let sendBooking:((data:unknown)=>void)|undefined;
 const stream=new ReadableStream({
  start(controller){
   sendBooking=(data:unknown)=>controller.enqueue(encoder.encode(`event: booking\ndata: ${JSON.stringify(data)}\n\n`));
   const close=()=>{clearInterval(heartbeat);if(sendBooking)bookingEvents.off('booking',sendBooking);try{controller.close()}catch{}}
   bookingEvents.on('booking',sendBooking);heartbeat=setInterval(()=>controller.enqueue(encoder.encode(': keep-alive\n\n')),15000);
   controller.enqueue(encoder.encode('retry: 1500\nevent: connected\ndata: {}\n\n'));
   request.signal.addEventListener('abort',close,{once:true});
  },cancel(){clearInterval(heartbeat);if(sendBooking)bookingEvents.off('booking',sendBooking)}
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
}
