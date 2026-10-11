import {getCustomer} from '@/lib/customer-auth';
import {database} from '@/lib/database';
import {readLiveAttempt} from '@/lib/live-cash-booking';
import {unavailable} from '@/lib/security';
import {getGuestSession} from '@/lib/customer-guest';
import {taxiCrmCustomerReadEnabled} from '@/lib/taxicrm-database';
import {taxiCrmBookingTracking} from '@/lib/taxicrm-customer-trips';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const customer=await getCustomer(),guest=customer?null:await getGuestSession(),userId=customer?.id||guest?.id;if(!userId)return Response.json({error:'Sign in or continue as guest to check your booking.'},{status:401});
 const id=new URL(request.url).searchParams.get('id')||'';
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return Response.json({error:'Invalid booking reference.'},{status:400});
 try{const result=await readLiveAttempt(database(),id,userId);if(!result)return Response.json({error:'Booking request not found.'},{status:404,headers:{'Cache-Control':'no-store'}});
  if(taxiCrmCustomerReadEnabled()&&result.externalBookingId){const tracking=await taxiCrmBookingTracking(result.externalBookingId);return Response.json({...result,tracking},{headers:{'Cache-Control':'no-store','X-Data-Source':'TaxiCRM'}})}
  return Response.json(result,{headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}
}
