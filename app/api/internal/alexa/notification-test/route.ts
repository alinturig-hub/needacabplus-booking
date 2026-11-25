import {equalSecret} from '@/lib/alexa/policy';
import {boundedBody} from '@/lib/alexa/body';
import {notificationTestStatus,testAlexaNotification} from '@/lib/alexa/notification-test';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
function authorized(request:Request){return equalSecret(process.env.BOOKING_WRITER_JOB_SECRET,request.headers.get('x-booking-writer-secret')||undefined);}
export async function GET(request:Request){
 if(!authorized(request))return Response.json({error:'Unauthorized.'},{status:401,headers});
 try{return Response.json(await notificationTestStatus(),{headers});}catch{return Response.json({error:'Diagnostics unavailable.'},{status:503,headers});}
}
export async function POST(request:Request){
 if(!authorized(request))return Response.json({error:'Unauthorized.'},{status:401,headers});
 let principal:string;
 try{const body=JSON.parse(await boundedBody(request,1024));if(!body||Object.keys(body).some(k=>k!=='principal')||typeof body.principal!=='string'||!/^[a-f0-9]{64}$/.test(body.principal))throw Error();principal=body.principal;}catch{return Response.json({error:'Invalid recipient.'},{status:400,headers});}
 try{return Response.json(await testAlexaNotification(principal),{headers});}catch{return Response.json({error:'Notification test unavailable.'},{status:503,headers});}
}
