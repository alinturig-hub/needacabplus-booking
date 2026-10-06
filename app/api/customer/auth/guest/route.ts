import {startGuestSession} from '@/lib/customer-guest';
import {sameOrigin,unavailable} from '@/lib/security';

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 try{await startGuestSession();return Response.json({ok:true})}catch(error){return unavailable(error)}
}
