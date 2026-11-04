import {getCustomer} from '@/lib/customer-auth';
import {getGuestSession,startGuestSession} from '@/lib/customer-guest';
import {loadEbooker} from '@/lib/ebookers';
import {sameOrigin,unavailable} from '@/lib/security';
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
 try{if(!await loadEbooker((await params).slug))return Response.json({error:'This eBooker is unavailable.'},{status:404});if(!await getCustomer()&&!await getGuestSession())await startGuestSession();return Response.json({ok:true})}catch(e){return unavailable(e)}
}
