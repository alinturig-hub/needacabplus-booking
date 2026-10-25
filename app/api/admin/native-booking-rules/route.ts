import {z} from 'zod';
import {database} from '@/lib/database';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {loadNativeBookingPolicy} from '@/lib/native-booking-configuration';
import {nativeBookingPolicySchema} from '@/lib/native-booking-policy';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{return Response.json({settings:await loadNativeBookingPolicy(),liveBookingReady:false},{headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}
}
export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{const settings=nativeBookingPolicySchema.parse(await request.json());await database().query("INSERT INTO app_configuration(section,settings,secrets_encrypted) VALUES('bookings_native',$1::jsonb,'') ON CONFLICT(section) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()",[JSON.stringify(settings)]);return Response.json({ok:true,settings,liveBookingReady:false})}
 catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:e instanceof z.ZodError?e.issues[0]?.message:'Invalid booking rules.'},{status:400});return unavailable(e)}
}
