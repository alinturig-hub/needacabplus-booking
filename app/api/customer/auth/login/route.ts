import {z} from 'zod';
import {findCustomerByEmail,setCustomerSession,verifyPassword} from '@/lib/customer-auth';
import {sameOrigin,unavailable} from '@/lib/security';

const schema=z.object({email:z.string().trim().email().max(250),password:z.string().min(1).max(200)}).strict();
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});try{const body=schema.parse(await request.json()),row=await findCustomerByEmail(body.email);if(!row||!await verifyPassword(body.password,row.password_hash))return Response.json({error:'Email address or password is incorrect.'},{status:401});await setCustomerSession(row.id);return Response.json({customer:{id:row.id,email:row.email,fullName:row.full_name,phone:row.phone,stripeCustomerId:row.stripe_customer_id}})}catch(error){if(error instanceof z.ZodError)return Response.json({error:'Enter a valid email address and password.'},{status:400});return unavailable(error)}}
