import {z} from 'zod';
import {createCustomer,setCustomerSession} from '@/lib/customer-auth';
import {sameOrigin,unavailable} from '@/lib/security';

const schema=z.object({email:z.string().trim().email().max(250),password:z.string().min(10).max(200),fullName:z.string().trim().min(2).max(100),phone:z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/)}).strict();
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});try{const body=schema.parse(await request.json()),customer=await createCustomer(body);await setCustomerSession(customer.id);return Response.json({customer},{status:201})}catch(error){if(error instanceof z.ZodError)return Response.json({error:error.issues[0]?.message||'Check your details.'},{status:400});if(error instanceof Error&&error.message.includes('duplicate key'))return Response.json({error:'An account already exists for this email address.'},{status:409});return unavailable(error)}}
