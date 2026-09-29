import {getCustomer} from '@/lib/customer-auth';
import {database} from '@/lib/database';
import {readLiveAttempt} from '@/lib/live-cash-booking';
import {unavailable} from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const customer=await getCustomer();if(!customer)return Response.json({error:'Sign in to check your booking.'},{status:401});
 const id=new URL(request.url).searchParams.get('id')||'';
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return Response.json({error:'Invalid booking reference.'},{status:400});
 try{const result=await readLiveAttempt(database(),id,customer.id);return Response.json(result||{error:'Booking request not found.'},{status:result?200:404,headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}
}
