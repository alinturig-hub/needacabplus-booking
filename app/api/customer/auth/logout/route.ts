import {clearCustomerSession} from '@/lib/customer-auth';
import {sameOrigin,unavailable} from '@/lib/security';
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});try{await clearCustomerSession();return Response.json({ok:true})}catch(error){return unavailable(error)}}
