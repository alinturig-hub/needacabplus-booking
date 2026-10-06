import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {findCustomerByPhone,hashPassword} from '@/lib/customer-auth';
import {AuthError,beginChallenge,normalizePhone,requestAuthLimit} from '@/lib/customer-verification';
import {sameOrigin,unavailable} from '@/lib/security';

const schema=z.object({phone:z.string().trim().min(7).max(30)}).strict();
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403});
 try{
  await requestAuthLimit(request);const phone=normalizePhone(schema.parse(await request.json()).phone),customer=await findCustomerByPhone(phone);
  const payload:Record<string,string>=customer?{}:{email:`${phone.replace(/\D/g,'')}@phone.needacabplus.app`,passwordHash:await hashPassword(randomBytes(32).toString('base64url')),fullName:'Passenger'};
  return Response.json({...await beginChallenge('mobile',phone,payload,customer?.id||null),phone});
 }catch(error){if(error instanceof AuthError)return Response.json({error:error.message},{status:error.status});if(error instanceof z.ZodError)return Response.json({error:'Enter a valid mobile number.'},{status:400});return unavailable(error)}
}
