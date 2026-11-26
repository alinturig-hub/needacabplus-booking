import {runReminderUpdateTests} from '@/lib/alexa/reminder-update-test';
import {equalSecret} from '@/lib/alexa/policy';
import {runAlexaNotifications} from '@/lib/alexa/notifications';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!equalSecret(process.env.BOOKING_WRITER_JOB_SECRET,request.headers.get('x-booking-writer-secret')||undefined))return Response.json({error:'Unauthorized.'},{status:401});
 try{const reminderTests=await runReminderUpdateTests();return Response.json({...await runAlexaNotifications(),reminderTests},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Alexa notification worker unavailable.'},{status:503});}
}
