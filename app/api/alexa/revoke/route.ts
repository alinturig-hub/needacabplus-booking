import {getCustomer} from '@/lib/customer-auth';
import {sameOrigin} from '@/lib/security';
import {database} from '@/lib/database';
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});const customer=await getCustomer();if(!customer)return Response.json({error:'Sign in first.'},{status:401});const db=database();await db.query('UPDATE alexa_grants SET revoked_at=now() WHERE customer_id=$1 AND revoked_at IS NULL',[customer.id]);return Response.redirect(new URL('/alexa',request.url),303);}
