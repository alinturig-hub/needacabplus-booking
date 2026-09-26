import {isAdmin} from '@/lib/security';
import {clearDrivers} from '@/lib/live-drivers';
import {driverPositionEvents} from '@/lib/driver-position-events';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(request:Request){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 const encoder=new TextEncoder();let heartbeat:ReturnType<typeof setInterval>,fallback:ReturnType<typeof setInterval>,closed=false,running=false;
 let update:(()=>void)|undefined;
 const stream=new ReadableStream({
  start(controller){
   const send=async()=>{if(closed||running)return;running=true;try{const drivers=await clearDrivers();if(!closed)controller.enqueue(encoder.encode(`event: drivers\ndata: ${JSON.stringify(drivers)}\n\n`))}catch{if(!closed)controller.enqueue(encoder.encode('event: stream-error\ndata: {}\n\n'))}finally{running=false}};
   update=()=>void send();
   const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);clearInterval(fallback);if(update)driverPositionEvents.off('position',update);try{controller.close()}catch{}};
   driverPositionEvents.on('position',update);
   heartbeat=setInterval(()=>{if(!closed)controller.enqueue(encoder.encode(': keep-alive\n\n'))},15000);
   fallback=setInterval(()=>void send(),5000);
   controller.enqueue(encoder.encode('retry: 1500\nevent: connected\ndata: {}\n\n'));
   void send();request.signal.addEventListener('abort',close,{once:true});
  },
  cancel(){closed=true;clearInterval(heartbeat);clearInterval(fallback);if(update)driverPositionEvents.off('position',update)}
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
}
