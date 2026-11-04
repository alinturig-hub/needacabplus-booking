import {z} from 'zod';
import {taxiCrmCustomerReadEnabled} from '@/lib/taxicrm-database';
import {taxiCrmBookingTracking} from '@/lib/taxicrm-customer-trips';
import {findOwnedEbookerRequest,loadEbooker} from '@/lib/ebookers';
import {getCustomer} from '@/lib/customer-auth';
import {getGuestSession} from '@/lib/customer-guest';
import {bookingAttemptDatabase} from '@/lib/database';
import {readLiveAttempt} from '@/lib/live-cash-booking';
import {sameOrigin,unavailable} from '@/lib/security';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 try{
  const config=await loadEbooker((await params).slug,true);if(!config)return Response.json({error:'Booking not found.'},{status:404});
  const [customer,guest]=await Promise.all([getCustomer(),getGuestSession()]);
  const owners=[customer?.id,guest?.id].filter((id):id is string=>Boolean(id));
  if(!owners.length)return Response.json({error:'Use the device/session that made this booking, sign in, or contact support.'},{status:401});
  const raw=await request.text();if(raw.length>2048)return Response.json({error:'Invalid booking reference.'},{status:400});const parsed=z.object({reference:z.string().trim().min(1).max(80)}).strict().safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Enter your booking reference.'},{status:400});const body=parsed.data;
  let id:string|null=null,userId='';
  for(const owner of owners){id=await findOwnedEbookerRequest(config.id,owner,body.reference);if(id){userId=owner;break}}
  if(!id)return Response.json({error:'Booking not found in this session. Use the original device or contact support.'},{status:404});
  const result=await readLiveAttempt(bookingAttemptDatabase(),id,userId);
  const tracking=result?.externalBookingId&&taxiCrmCustomerReadEnabled()?await taxiCrmBookingTracking(result.externalBookingId):null;
  return result?Response.json({...result,...(tracking?{tracking}:{})},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'No live booking was found; this may have been a preview.'},{status:404});
 }catch(e){if(e instanceof SyntaxError)return Response.json({error:'Invalid booking reference.'},{status:400});return unavailable(e)}
}
