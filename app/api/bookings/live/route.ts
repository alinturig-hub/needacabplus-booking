import {isAdmin} from '@/lib/security';
import {bookingEvents} from '@/lib/booking-events';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
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
