import {z} from 'zod';
import {sameOrigin} from '@/lib/security';
import {finishChallenge,OTP_DIGITS,AuthError,requestAuthLimit} from '@/lib/customer-verification';
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid origin'},{status:403});try{await requestAuthLimit(request);const {code}=z.object({code:z.string().regex(new RegExp(`^\\d{${OTP_DIGITS}}$`))}).strict().parse(await request.json());return Response.json(await finishChallenge(code))}catch(e){return Response.json({error:e instanceof AuthError?e.message:'Unable to verify. Please start again.'},{status:e instanceof AuthError?e.status:400})}}
