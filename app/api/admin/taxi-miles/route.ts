import {z} from 'zod';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {readTaxiMiles,saveTaxiMiles} from '@/lib/taxi-miles-store';
export const dynamic='force-dynamic';
export async function GET(){if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{return Response.json(await readTaxiMiles(),{headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}}
export async function PUT(request:Request){if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{const b=z.object({policy:z.unknown(),version:z.number().int().positive()}).strict().parse(await request.json());const result=await saveTaxiMiles(b.policy,b.version);return result?Response.json(result):Response.json({error:'Settings changed in another session. Reload before saving.'},{status:409})}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:e instanceof z.ZodError?e.issues[0]?.message:'Invalid settings.'},{status:400});return unavailable(e)}}
