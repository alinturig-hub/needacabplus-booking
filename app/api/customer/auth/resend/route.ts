import {sameOrigin} from '@/lib/security';
import {pendingChallenge,beginChallenge,AuthError,requestAuthLimit} from '@/lib/customer-verification';
import {decryptCredentials} from '@/lib/credentials';
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'Invalid origin'},{status:403});try{await requestAuthLimit(request);const row=await pendingChallenge();if(!row.phone||!row.code_hash)throw new AuthError('Enter your mobile number first.');return Response.json(await beginChallenge(row.purpose,row.phone,decryptCredentials(row.payload_encrypted),row.customer_id))}catch(e){return Response.json({error:e instanceof AuthError?e.message:'Unable to resend code.'},{status:e instanceof AuthError?e.status:400})}}
